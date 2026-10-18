import type { Item } from '@prisma/client';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { config } from '$lib/server/env';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { renderStickerPdf } from '$lib/server/pdf/sticker-pdf';
import { extractCode } from '$lib/domain/scan';
import { itemDisplayName } from '$lib/domain/item';
import { itemSubject, recordEvent } from './history';
import { placePart } from './split';
import { codeNeighbors, formatCode, generateCodes, normalizeCode } from '$lib/domain/sticker-code';
import {
	type BlankCounts,
	DEFAULT_STICKER_WIDTH,
	MAX_SHEETS_PER_BATCH,
	STICKER_CAPTION_MAX_LENGTH,
	STICKER_WIDTHS,
	type StickerWidth,
	isStickerWidth,
	planSheets,
	toStickerWidth
} from '$lib/domain/sticker-sheet';

/**
 * Binds a free sticker to an active item that has no sticker yet. Used when
 * creating an item from a scanned sticker and when attaching a sticker to an
 * existing item. A sticker marks one thing: when the record holds several,
 * one is split off into a record of its own (same place and own parameters)
 * and the sticker goes on it. Returns the id of the stickered record.
 */
export async function bindSticker(
	actor: Actor,
	codeInput: string,
	itemId: string,
	tx?: Tx
): Promise<{ itemId: string }> {
	if (!tx) return writeTransaction((t) => bindSticker(actor, codeInput, itemId, t));
	const code = normalizeCode(codeInput);
	if (!code) throw new ValidationError('Некорректный ID наклейки');
	const sticker = await tx.sticker.findFirst({ where: { code, ...visibleTo(actor) } });
	if (!sticker) throw new NotFoundError('Такой наклейки нет');
	if (sticker.status !== 'FREE') {
		throw new ConflictError(`Наклейка ${formatCode(code)} уже использована`);
	}
	const item = await tx.item.findFirst({
		where: { id: itemId, status: 'ACTIVE', isWorkbench: false, ...visibleTo(actor) }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	const existing = await tx.sticker.findUnique({ where: { itemId } });
	if (existing) throw new ConflictError('У вещи уже есть наклейка');
	const target = await stickerTarget(tx, item);
	await tx.sticker.update({ where: { id: sticker.id }, data: { status: 'BOUND', itemId: target } });
	// The thing got a sticker by hand, so its order is no longer needed.
	if (item.stickerOrderedAt) {
		await tx.item.update({
			where: { id: item.id },
			data: { stickerOrderedAt: null, stickerCaption: null }
		});
	}
	await recordEvent(tx, actor, {
		kind: 'sticker.bound',
		subject: await itemSubject(tx, item.id),
		data: { code, resultId: target }
	});
	return { itemId: target };
}

/**
 * The record a new sticker goes on. A sticker marks one thing: when the
 * record holds several, one is split off into a record of its own (same
 * place and own parameters).
 */
async function stickerTarget(tx: Tx, item: Item): Promise<string> {
	if (item.quantity <= 1) return item.id;
	return placePart(
		tx,
		item,
		1,
		{
			parentId: item.parentId,
			takenById: item.takenById,
			takenAt: item.takenAt,
			homeId: item.homeId,
			createdOnBench: item.createdOnBench,
			splitFromId: item.splitFromId
		},
		{ merge: false }
	);
}

/**
 * Detaches a damaged sticker from an item: the sticker is written off and
 * forgets the item (so restoring the item from the archive does not re-bind
 * it), and the item can get a new sticker.
 */
export async function unbindSticker(actor: Actor, itemId: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const sticker = await tx.sticker.findFirst({
			where: { itemId, status: 'BOUND', ...visibleTo(actor) }
		});
		if (!sticker) throw new NotFoundError('У вещи нет наклейки');
		await tx.sticker.update({
			where: { id: sticker.id },
			data: { status: 'WRITTEN_OFF', itemId: null }
		});
		await recordEvent(tx, actor, {
			kind: 'sticker.unbound',
			subject: await itemSubject(tx, itemId),
			data: { code: sticker.code }
		});
	});
}

/**
 * For the archive flow: writes off the stickers of items being archived,
 * keeping the link so restoreStickerOf can re-bind them. The caller has
 * already checked that the actor may change these items.
 */
export async function writeOffStickerOf(itemIds: string[], tx: Tx = db): Promise<void> {
	if (itemIds.length === 0) return;
	await tx.sticker.updateMany({
		where: { itemId: { in: itemIds }, status: 'BOUND' },
		data: { status: 'WRITTEN_OFF' }
	});
}

/**
 * For the restore flow: re-binds written-off stickers still linked to the
 * restored items (stickers detached as damaged are no longer linked). The
 * caller has already checked that the actor may change these items.
 */
export async function restoreStickerOf(itemIds: string[], tx: Tx = db): Promise<void> {
	if (itemIds.length === 0) return;
	await tx.sticker.updateMany({
		where: { itemId: { in: itemIds }, status: 'WRITTEN_OFF' },
		data: { status: 'BOUND' }
	});
}

// ---------------------------------------------------------------------------
// Orders («Заказать наклейку»)
// ---------------------------------------------------------------------------

export interface StickerOrder {
	itemId: string;
	/** What the sticker will say: the edited caption, or the item's name at the moment. */
	caption: string;
	/** The item's name: the caption unless it was edited. */
	name: string;
	/** The caption was edited and differs from the item's name. */
	customCaption: boolean;
	quantity: number;
	orderedAt: Date;
	width: StickerWidth;
}

/**
 * Orders a sticker of the given width for an active item without one: the
 * next batch prints it with the item's name and binds it to the item
 * (issueBatch). Ordering again only changes the width.
 */
export async function orderSticker(
	actor: Actor,
	itemId: string,
	width: StickerWidth = DEFAULT_STICKER_WIDTH
): Promise<void> {
	if (!isStickerWidth(width)) throw new ValidationError('Наклейки бывают шириной 10, 20 или 40 мм');
	await writeTransaction(async (tx) => {
		const item = await tx.item.findFirst({
			where: { id: itemId, status: 'ACTIVE', isWorkbench: false, ...visibleTo(actor) },
			include: { sticker: { select: { status: true } } }
		});
		if (!item) throw new NotFoundError('Вещь не найдена');
		if (item.sticker?.status === 'BOUND') throw new ConflictError('У вещи уже есть наклейка');
		if (item.stickerOrderedAt) {
			if (item.stickerOrderWidth !== width) {
				await tx.item.update({ where: { id: item.id }, data: { stickerOrderWidth: width } });
			}
			return;
		}
		await tx.item.update({
			where: { id: item.id },
			data: { stickerOrderedAt: new Date(), stickerOrderWidth: width }
		});
		await recordEvent(tx, actor, {
			kind: 'sticker.ordered',
			subject: await itemSubject(tx, item.id),
			data: width === DEFAULT_STICKER_WIDTH ? {} : { width }
		});
	});
}

/** Cancels the item's sticker order; nothing happens when there is none. */
export async function cancelStickerOrder(actor: Actor, itemId: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const item = await tx.item.findFirst({ where: { id: itemId, ...visibleTo(actor) } });
		if (!item) throw new NotFoundError('Вещь не найдена');
		if (!item.stickerOrderedAt) return;
		await tx.item.update({
			where: { id: item.id },
			data: { stickerOrderedAt: null, stickerCaption: null }
		});
		await recordEvent(tx, actor, {
			kind: 'sticker.orderCancelled',
			subject: await itemSubject(tx, item.id),
			data: {}
		});
	});
}

/**
 * Changes what the item's sticker waiting for print will say; the order and
 * its width stay. An empty caption or the item's name goes back to the name,
 * so later renames of the item reach the sticker again.
 */
export async function setStickerOrderCaption(
	actor: Actor,
	itemId: string,
	captionInput: string
): Promise<void> {
	const caption = captionInput.replace(/\s+/g, ' ').trim();
	if (caption.length > STICKER_CAPTION_MAX_LENGTH) {
		throw new ValidationError(
			`Подпись наклейки — не длиннее ${STICKER_CAPTION_MAX_LENGTH} символов`
		);
	}
	await writeTransaction(async (tx) => {
		const item = await tx.item.findFirst({
			where: { id: itemId, status: 'ACTIVE', ...visibleTo(actor) },
			include: { type: { select: { name: true } } }
		});
		if (!item) throw new NotFoundError('Вещь не найдена');
		if (!item.stickerOrderedAt) throw new ConflictError('Наклейка для этой вещи не ждёт печати');
		const name = itemDisplayName(item);
		const stickerCaption = caption && caption !== name ? caption : null;
		if (stickerCaption === item.stickerCaption) return;
		await tx.item.update({ where: { id: item.id }, data: { stickerCaption } });
		await recordEvent(tx, actor, {
			kind: 'sticker.captionChanged',
			subject: await itemSubject(tx, item.id),
			data: { before: item.stickerCaption ?? name, after: stickerCaption ?? name }
		});
	});
}

/** Active items waiting for a sticker, oldest order first (the print order). */
export async function listStickerOrders(actor: Actor, tx: Tx = db): Promise<StickerOrder[]> {
	const items = await tx.item.findMany({
		where: { stickerOrderedAt: { not: null }, status: 'ACTIVE', ...visibleTo(actor) },
		include: { type: { select: { name: true } } },
		orderBy: [{ stickerOrderedAt: 'asc' }, { id: 'asc' }]
	});
	return items.map((i) => ({
		itemId: i.id,
		caption: i.stickerCaption ?? itemDisplayName(i),
		name: itemDisplayName(i),
		customCaption: i.stickerCaption !== null,
		quantity: i.quantity,
		orderedAt: i.stickerOrderedAt!,
		width: toStickerWidth(i.stickerOrderWidth)
	}));
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export interface BatchSummary {
	id: string;
	createdAt: Date;
	total: number;
	captioned: number;
	/** Printed for ordered items and bound to them on issue. */
	ordered: number;
	free: number;
	bound: number;
	writtenOff: number;
	/** «Не распечатано» still works: no sticker of the batch is in use yet. */
	unprintable: boolean;
}

/**
 * Stickers in use, which means their batch was printed: a blank one bound by
 * scanning or written off, or an ordered one detached from its item.
 */
const stickerInUse = {
	OR: [
		{ fromOrder: false, status: { not: 'FREE' as const } },
		{ fromOrder: true, itemId: null }
	]
};

/**
 * Issues a batch of new stickers: one per ordered item (in `orderItemIds`,
 * the orders the person saw) in the width of its order, and `blanks[width]`
 * blank ones of each width, with extra blank stickers `fill` wide to fill the
 * last A4 sheet unless `fill` is null (FR-9). Every new code differs from every code ever issued in at least 3
 * positions (FR-11). Ordered stickers carry the item's name and are bound to
 * the item right away (one thing is split off a record holding several);
 * their orders are fulfilled.
 */
export async function issueBatch(
	actor: Actor,
	input: {
		blanks: BlankCounts;
		orderItemIds?: string[];
		/** Width of the blank stickers filling the rest of the last sheet; null — do not fill. */
		fill?: StickerWidth | null;
	}
): Promise<BatchSummary> {
	if (!config().qrBaseUrl) throw noQrBaseUrl();
	const fill = input.fill === undefined ? DEFAULT_STICKER_WIDTH : input.fill;
	if (fill !== null && !isStickerWidth(fill)) {
		throw new ValidationError('Наклейки бывают шириной 10, 20 или 40 мм');
	}
	for (const width of STICKER_WIDTHS) {
		const count = input.blanks[width] ?? 0;
		if (!Number.isInteger(count) || count < 0) {
			throw new ValidationError('Число наклеек без подписи должно быть целым и не меньше 0');
		}
	}
	const orderIds = [...new Set(input.orderItemIds ?? [])];

	const { batch, plan, ordered } = await writeTransaction(
		async (tx) => {
			const orders = (await listStickerOrders(actor, tx)).filter((o) =>
				orderIds.includes(o.itemId)
			);
			if (orders.length !== orderIds.length) {
				throw new ConflictError('Список наклеек, ждущих печати, изменился, обновите страницу');
			}
			const captioned = orders.map((o) => ({ caption: o.caption, width: o.width }));
			const plan = planSheets(captioned, input.blanks, fill);
			if (plan.total === 0) throw new ValidationError('Нужна хотя бы одна наклейка');
			if (plan.sheets > MAX_SHEETS_PER_BATCH) {
				throw new ValidationError(
					`За раз можно напечатать не больше ${MAX_SHEETS_PER_BATCH} листов`
				);
			}

			// Uniqueness is server-wide, so all codes count regardless of owner.
			const existing = await tx.sticker.findMany({ select: { code: true } });
			const codes = generateCodes(
				existing.map((s) => s.code),
				plan.total
			);
			const targets: string[] = [];
			for (const order of orders) {
				const item = await tx.item.update({
					where: { id: order.itemId },
					data: { stickerOrderedAt: null, stickerCaption: null }
				});
				targets.push(await stickerTarget(tx, item));
			}
			const batch = await tx.stickerBatch.create({ data: { ...ownedBy(actor) } });
			// Slots are in print order; an ordered sticker's slot points at its order.
			const orderCodes: string[] = [];
			await tx.sticker.createMany({
				data: plan.slots.map(({ index, width }, position) => {
					const code = codes[position]!;
					const ordered = index !== null && index < orders.length;
					if (ordered) orderCodes[index] = code;
					return {
						code,
						caption: index === null ? null : captioned[index]!.caption,
						width,
						position,
						batchId: batch.id,
						...ownedBy(actor),
						...(ordered
							? { status: 'BOUND' as const, itemId: targets[index], fromOrder: true }
							: {})
					};
				})
			});
			for (const [i, order] of orders.entries()) {
				await recordEvent(tx, actor, {
					kind: 'sticker.printed',
					subject: await itemSubject(tx, order.itemId),
					data: { code: orderCodes[i]!, resultId: targets[i] },
					refIds: [batch.id]
				});
			}
			await recordEvent(tx, actor, {
				kind: 'stickers.issued',
				subject: { id: batch.id, name: 'Наклейки', kind: 'batch', ...ownedBy(actor) },
				data: { count: plan.total, ...(orders.length > 0 ? { ordered: orders.length } : {}) }
			});
			return { batch, plan, ordered: orders.length };
		},
		{ timeout: 30_000 }
	);
	return {
		id: batch.id,
		createdAt: batch.createdAt,
		total: plan.total,
		captioned: plan.captioned,
		ordered,
		free: plan.total - ordered,
		bound: ordered,
		writtenOff: 0,
		unprintable: true
	};
}

/**
 * «Не распечатано»: the batch was never printed, so it is deleted with its
 * stickers and their IDs become free for new batches. Ordered items get
 * their orders back. Refused once any sticker of the batch is in use (bound
 * by scanning, or detached as damaged), because then it was printed.
 */
export async function unprintBatch(actor: Actor, batchId: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const batch = await tx.stickerBatch.findFirst({ where: { id: batchId, ...visibleTo(actor) } });
		if (!batch) throw new NotFoundError('Пачка наклеек не найдена');
		const stickers = await tx.sticker.findMany({
			where: { batchId: batch.id },
			orderBy: { position: 'asc' }
		});
		const used = await tx.sticker.findMany({
			where: { batchId: batch.id, ...stickerInUse },
			orderBy: { position: 'asc' },
			select: { code: true }
		});
		if (used.length > 0) {
			const codes = used.slice(0, 3).map((s) => formatCode(s.code));
			const more = used.length > 3 ? ` и ещё ${used.length - 3}` : '';
			throw new ConflictError(
				`Наклейки из этой пачки уже используются (${codes.join(', ')}${more}), значит, она напечатана`
			);
		}
		const reordered = stickers.filter((s) => s.fromOrder && s.itemId);
		const orderedAt = new Date();
		for (const width of STICKER_WIDTHS) {
			const ids = reordered.filter((s) => s.width === width).map((s) => s.itemId!);
			if (ids.length === 0) continue;
			await tx.item.updateMany({
				where: { id: { in: ids } },
				data: { stickerOrderedAt: orderedAt, stickerOrderWidth: width }
			});
		}
		// An edited caption comes back with the order; one equal to the name stays the name.
		const items = await tx.item.findMany({
			where: { id: { in: reordered.map((s) => s.itemId!) } },
			select: { id: true, name: true, type: { select: { name: true } } }
		});
		for (const item of items) {
			const caption = reordered.find((s) => s.itemId === item.id)!.caption;
			if (caption && caption !== itemDisplayName(item)) {
				await tx.item.update({ where: { id: item.id }, data: { stickerCaption: caption } });
			}
		}
		await tx.sticker.deleteMany({ where: { batchId: batch.id } });
		await tx.stickerBatch.delete({ where: { id: batch.id } });
		await recordEvent(tx, actor, {
			kind: 'stickers.unprinted',
			subject: {
				id: batch.id,
				name: 'Наклейки',
				kind: 'batch',
				ownerId: batch.ownerId,
				householdId: batch.householdId
			},
			data: {
				count: stickers.length,
				...(reordered.length > 0 ? { ordered: reordered.length } : {})
			},
			refIds: reordered.map((s) => s.itemId!)
		});
	});
}

/** The actor's batches, newest first, with sticker counts by status. */
export async function listBatches(actor: Actor): Promise<BatchSummary[]> {
	const batches = await db.stickerBatch.findMany({
		where: visibleTo(actor),
		orderBy: { createdAt: 'desc' },
		select: { id: true, createdAt: true }
	});
	if (batches.length === 0) return [];
	const ids = batches.map((b) => b.id);
	const [byStatus, captioned, ordered, inUse] = await Promise.all([
		db.sticker.groupBy({
			by: ['batchId', 'status'],
			where: { batchId: { in: ids } },
			_count: { _all: true }
		}),
		db.sticker.groupBy({
			by: ['batchId'],
			where: { batchId: { in: ids }, caption: { not: null } },
			_count: { _all: true }
		}),
		db.sticker.groupBy({
			by: ['batchId'],
			where: { batchId: { in: ids }, fromOrder: true },
			_count: { _all: true }
		}),
		db.sticker.groupBy({
			by: ['batchId'],
			where: { batchId: { in: ids }, ...stickerInUse },
			_count: { _all: true }
		})
	]);
	return batches.map((b) => {
		const count = (status: string) =>
			byStatus.find((g) => g.batchId === b.id && g.status === status)?._count._all ?? 0;
		const free = count('FREE');
		const bound = count('BOUND');
		const writtenOff = count('WRITTEN_OFF');
		return {
			...b,
			total: free + bound + writtenOff,
			captioned: captioned.find((g) => g.batchId === b.id)?._count._all ?? 0,
			ordered: ordered.find((g) => g.batchId === b.id)?._count._all ?? 0,
			free,
			bound,
			writtenOff,
			unprintable: !inUse.some((g) => g.batchId === b.id)
		};
	});
}

function noQrBaseUrl(): ConflictError {
	return new ConflictError(
		'Не задан адрес приложения (ORIGIN или QR_BASE_URL): QR-коды на наклейках вели бы в никуда'
	);
}

/** The batch PDF, regenerated from the stored codes (a lost PDF can be printed again). */
export async function getBatchPdf(
	actor: Actor,
	batchId: string,
	qrBaseUrl: string | null = config().qrBaseUrl
): Promise<{ filename: string; pdf: Buffer }> {
	if (!qrBaseUrl) throw noQrBaseUrl();
	const batch = await db.stickerBatch.findFirst({ where: { id: batchId, ...visibleTo(actor) } });
	if (!batch) throw new NotFoundError('Пачка наклеек не найдена');
	const stickers = await db.sticker.findMany({
		where: { batchId: batch.id },
		orderBy: { position: 'asc' },
		select: { code: true, caption: true, width: true }
	});
	const pdf = await renderStickerPdf(
		stickers.map((s) => ({ ...s, width: toStickerWidth(s.width) })),
		qrBaseUrl
	);
	const date = batch.createdAt.toISOString().slice(0, 10);
	return { filename: `stickers-${date}-${batch.id.slice(-8)}.pdf`, pdf };
}

export type ResolveResult =
	| { status: 'bound'; code: string; caption: string | null; itemId: string }
	| { status: 'free'; code: string; caption: string | null }
	| { status: 'written_off'; code: string; caption: string | null; itemId?: string }
	| { status: 'unknown'; code?: string; suggestion?: string };

/**
 * What a scanned or typed ID points to (GET /api/stickers/resolve). Accepts
 * a code in any case with or without the dash, or a sticker URL. For an
 * unknown code suggests a sticker one typo away («Возможно, K7M-4QX?»).
 */
export async function resolveCode(actor: Actor, input: string): Promise<ResolveResult> {
	const code = extractCode(input);
	if (!code) return { status: 'unknown' };
	const sticker = await db.sticker.findFirst({ where: { code, ...visibleTo(actor) } });
	if (!sticker) {
		const similar = await db.sticker.findFirst({
			where: { code: { in: codeNeighbors(code) }, ...visibleTo(actor) },
			select: { code: true }
		});
		return similar
			? { status: 'unknown', code, suggestion: formatCode(similar.code) }
			: { status: 'unknown', code };
	}
	const base = { code, caption: sticker.caption };
	switch (sticker.status) {
		case 'FREE':
			return { status: 'free', ...base };
		case 'BOUND':
			return { status: 'bound', ...base, itemId: sticker.itemId! };
		case 'WRITTEN_OFF':
			return sticker.itemId
				? { status: 'written_off', ...base, itemId: sticker.itemId }
				: { status: 'written_off', ...base };
	}
}
