import { db, type Tx } from '$lib/server/db';
import { config } from '$lib/server/env';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { renderStickerPdf } from '$lib/server/pdf/sticker-pdf';
import { extractCode } from '$lib/domain/scan';
import { placePart } from './split';
import { codeNeighbors, formatCode, generateCodes, normalizeCode } from '$lib/domain/sticker-code';
import { MAX_SHEETS_PER_BATCH, STICKERS_PER_SHEET, planSheets } from '$lib/domain/sticker-sheet';

/** Serializes code generation so concurrent batches cannot issue codes close to each other. */
const ISSUE_LOCK_KEY = 0x5711c0de;

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
	if (!tx) return db.$transaction((t) => bindSticker(actor, codeInput, itemId, t));
	const code = normalizeCode(codeInput);
	if (!code) throw new ValidationError('Некорректный ID наклейки');
	const sticker = await tx.sticker.findFirst({ where: { code, ...visibleTo(actor) } });
	if (!sticker) throw new NotFoundError('Такой наклейки нет');
	if (sticker.status !== 'FREE') {
		throw new ConflictError(`Наклейка ${formatCode(code)} уже использована`);
	}
	const item = await tx.item.findFirst({
		where: { id: itemId, status: 'ACTIVE', ...visibleTo(actor) }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	const existing = await tx.sticker.findUnique({ where: { itemId } });
	if (existing) throw new ConflictError('У вещи уже есть наклейка');
	const target =
		item.quantity > 1
			? await placePart(
					tx,
					item,
					1,
					{
						parentId: item.parentId,
						takenById: item.takenById,
						takenAt: item.takenAt,
						homeId: item.homeId,
						splitFromId: item.splitFromId
					},
					{ merge: false }
				)
			: item.id;
	await tx.sticker.update({ where: { id: sticker.id }, data: { status: 'BOUND', itemId: target } });
	return { itemId: target };
}

/**
 * Detaches a damaged sticker from an item: the sticker is written off and
 * forgets the item (so restoring the item from the archive does not re-bind
 * it), and the item can get a new sticker.
 */
export async function unbindSticker(actor: Actor, itemId: string): Promise<void> {
	const sticker = await db.sticker.findFirst({
		where: { itemId, status: 'BOUND', ...visibleTo(actor) }
	});
	if (!sticker) throw new NotFoundError('У вещи нет наклейки');
	await db.sticker.update({
		where: { id: sticker.id },
		data: { status: 'WRITTEN_OFF', itemId: null }
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

export interface BatchSummary {
	id: string;
	createdAt: Date;
	total: number;
	captioned: number;
	free: number;
	bound: number;
	writtenOff: number;
}

/**
 * Issues a batch of new stickers: the captions plus `blankCount` blank ones,
 * rounded up to whole A4 sheets with extra blank stickers (FR-9). Every new
 * code differs from every code ever issued in at least 3 positions (FR-11).
 */
export async function issueBatch(
	actor: Actor,
	input: { captions: string[]; blankCount: number }
): Promise<BatchSummary> {
	const captions = input.captions.map((c) => c.trim()).filter((c) => c.length > 0);
	if (!Number.isInteger(input.blankCount) || input.blankCount < 0) {
		throw new ValidationError('Число наклеек без подписи должно быть целым и не меньше 0');
	}
	const plan = planSheets(captions.length, input.blankCount);
	if (plan.total === 0) throw new ValidationError('Нужна хотя бы одна наклейка');
	if (plan.sheets > MAX_SHEETS_PER_BATCH) {
		throw new ValidationError(
			`За раз можно напечатать не больше ${MAX_SHEETS_PER_BATCH} листов (${MAX_SHEETS_PER_BATCH * STICKERS_PER_SHEET} наклеек)`
		);
	}

	const batch = await db.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ISSUE_LOCK_KEY})`;
			// Uniqueness is server-wide, so all codes count regardless of owner.
			const existing = await tx.sticker.findMany({ select: { code: true } });
			const codes = generateCodes(
				existing.map((s) => s.code),
				plan.total
			);
			const batch = await tx.stickerBatch.create({ data: { ...ownedBy(actor) } });
			await tx.sticker.createMany({
				data: codes.map((code, position) => ({
					code,
					caption: captions[position] ?? null,
					position,
					batchId: batch.id,
					...ownedBy(actor)
				}))
			});
			return batch;
		},
		{ timeout: 30_000 }
	);
	return {
		id: batch.id,
		createdAt: batch.createdAt,
		total: plan.total,
		captioned: plan.captioned,
		free: plan.total,
		bound: 0,
		writtenOff: 0
	};
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
	const [byStatus, captioned] = await Promise.all([
		db.sticker.groupBy({
			by: ['batchId', 'status'],
			where: { batchId: { in: ids } },
			_count: { _all: true }
		}),
		db.sticker.groupBy({
			by: ['batchId'],
			where: { batchId: { in: ids }, caption: { not: null } },
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
			free,
			bound,
			writtenOff
		};
	});
}

/** The batch PDF, regenerated from the stored codes (a lost PDF can be printed again). */
export async function getBatchPdf(
	actor: Actor,
	batchId: string,
	qrBaseUrl: string = config().qrBaseUrl
): Promise<{ filename: string; pdf: Buffer }> {
	const batch = await db.stickerBatch.findFirst({ where: { id: batchId, ...visibleTo(actor) } });
	if (!batch) throw new NotFoundError('Пачка наклеек не найдена');
	const stickers = await db.sticker.findMany({
		where: { batchId: batch.id },
		orderBy: { position: 'asc' },
		select: { code: true, caption: true }
	});
	const pdf = await renderStickerPdf(stickers, qrBaseUrl);
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
