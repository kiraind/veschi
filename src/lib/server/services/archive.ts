import { db, type Tx } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { getPaths, isContainerItem, type PathNode } from './paths';
import { itemRef, itemSubject, placeRef, recordEvent } from './history';
import { restoreStickerOf, writeOffStickerOf } from './stickers';

/** Where the active contents of a discarded container go. */
export type DiscardContents = 'parent' | 'workbench' | 'discard';

export interface DiscardOptions {
	/** Default 'parent': where the container lay. */
	contents?: DiscardContents;
	/** Required for contents = 'workbench'. */
	workbenchId?: string;
	/** «Использовать» took all of it (for the history). */
	consumed?: boolean;
}

/** Ids of every item (any status) lying at any depth inside `itemId`. */
async function descendantIds(itemId: string, tx: Tx): Promise<string[]> {
	const rows = await tx.$queryRaw<{ id: string }[]>`
		WITH RECURSIVE sub AS (
			SELECT id, 1 AS depth FROM "Item" WHERE "parentId" = ${itemId}
			UNION ALL
			SELECT i.id, s.depth + 1 FROM "Item" i JOIN sub s ON i."parentId" = s.id WHERE s.depth < 100
		)
		SELECT id::text FROM sub
	`;
	return rows.map((r) => r.id);
}

async function findItem(actor: Actor, itemId: string, tx: Tx) {
	const item = await tx.item.findFirst({
		where: { id: itemId, isWorkbench: false, ...visibleTo(actor) }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	return item;
}

/**
 * «Выкинуть»: moves an item to the archive and writes off its sticker. Active
 * contents of a container go where the container lay (default), to a
 * workbench as taken items, or to the archive together with it.
 * An item lying directly on a workbench passes its contents on to that bench
 * as taken items with the container's home, so they stay visible there.
 */
export async function discard(
	actor: Actor,
	itemId: string,
	options: DiscardOptions = {},
	tx?: Tx
): Promise<void> {
	if (!tx) return db.$transaction((t) => discard(actor, itemId, options, t));
	const contents = options.contents ?? 'parent';
	const item = await findItem(actor, itemId, tx);
	if (item.status === 'ARCHIVED') throw new ValidationError('Вещь уже в архиве');
	const now = new Date();
	let archivedIds = [item.id];
	const subject = await itemSubject(tx, item.id);
	const from = await placeRef(tx, item.parentId);

	if (contents === 'discard') {
		const active = await tx.item.findMany({
			where: { id: { in: await descendantIds(item.id, tx) }, status: 'ACTIVE' },
			select: { id: true }
		});
		archivedIds = archivedIds.concat(active.map((i) => i.id));
	} else if (contents === 'workbench') {
		if (!options.workbenchId) throw new ValidationError('Выберите рабочий стол');
		const bench = await tx.item.findFirst({
			where: { id: options.workbenchId, isWorkbench: true, ...visibleTo(actor) }
		});
		if (!bench) throw new NotFoundError('Рабочий стол не найден');
		await tx.item.updateMany({
			where: { parentId: item.id, status: 'ACTIVE' },
			data: {
				parentId: bench.id,
				takenById: actor.userId,
				takenAt: now,
				homeId: item.takenById ? item.homeId : item.parentId,
				splitFromId: null
			}
		});
		await tx.user.update({ where: { id: actor.userId }, data: { lastWorkbenchId: bench.id } });
	} else {
		const onBench = item.takenById !== null;
		await tx.item.updateMany({
			where: { parentId: item.id, status: 'ACTIVE' },
			data: onBench
				? {
						parentId: item.parentId,
						takenById: item.takenById,
						takenAt: now,
						homeId: item.homeId,
						splitFromId: null
					}
				: { parentId: item.parentId }
		});
	}

	// One archivedAt for the whole operation lets restore bring a subtree back together.
	await tx.item.updateMany({
		where: { id: { in: archivedIds } },
		data: { status: 'ARCHIVED', archivedAt: now }
	});
	await writeOffStickerOf(archivedIds, tx);
	const together = archivedIds.slice(1);
	await recordEvent(tx, actor, {
		kind: 'item.discarded',
		subject,
		data: {
			quantity: item.quantity,
			from,
			together: together.length,
			...(options.consumed ? { consumed: true } : {})
		},
		refIds: together
	});
}

/**
 * Brings an archived item back (with the contents archived in the same
 * operation) and re-binds its written-off sticker. It stays in its old
 * container while that one is active, otherwise it goes to the top level.
 */
export async function restore(actor: Actor, itemId: string, tx?: Tx): Promise<void> {
	if (!tx) return db.$transaction((t) => restore(actor, itemId, t));
	const item = await findItem(actor, itemId, tx);
	if (item.status !== 'ARCHIVED') throw new ValidationError('Вещь не в архиве');

	const parent = item.parentId
		? await tx.item.findUnique({
				where: { id: item.parentId },
				select: { status: true, isWorkbench: true, type: { select: { isContainer: true } } }
			})
		: null;
	if (parent?.status !== 'ACTIVE' || !isContainerItem(parent)) {
		await tx.item.update({
			where: { id: item.id },
			data: { parentId: null, takenById: null, takenAt: null, homeId: null, splitFromId: null }
		});
	}

	const together = await tx.item.findMany({
		where: {
			id: { in: await descendantIds(item.id, tx) },
			status: 'ARCHIVED',
			archivedAt: item.archivedAt
		},
		select: { id: true }
	});
	const ids = [item.id, ...together.map((i) => i.id)];
	await tx.item.updateMany({
		where: { id: { in: ids } },
		data: { status: 'ACTIVE', archivedAt: null }
	});
	await restoreStickerOf(ids, tx);
	const restored = await tx.item.findUniqueOrThrow({
		where: { id: item.id },
		include: { type: { select: { name: true } } }
	});
	await recordEvent(tx, actor, {
		kind: 'item.restored',
		subject: itemRef(restored),
		data: { to: await placeRef(tx, restored.parentId), together: ids.length - 1 },
		refIds: ids
	});
}

/**
 * Deletes an archived item for good, with everything archived inside it.
 * Active items inside (restored on their own earlier) move to the top level.
 * Stickers stay WRITTEN_OFF with no item: codes are never reused.
 */
export async function purge(actor: Actor, itemId: string, tx?: Tx): Promise<void> {
	if (!tx) return db.$transaction((t) => purge(actor, itemId, t));
	const item = await findItem(actor, itemId, tx);
	if (item.status !== 'ARCHIVED') {
		throw new ValidationError('Удалить навсегда можно только вещь из архива');
	}
	const inside = await tx.item.findMany({
		where: { id: { in: await descendantIds(item.id, tx) }, status: 'ARCHIVED' },
		select: { id: true }
	});
	const ids = [item.id, ...inside.map((i) => i.id)];
	await recordEvent(tx, actor, {
		kind: 'item.purged',
		subject: await itemSubject(tx, item.id),
		data: { together: ids.length - 1 },
		refIds: ids
	});
	await tx.sticker.updateMany({
		where: { itemId: { in: ids } },
		data: { status: 'WRITTEN_OFF', itemId: null }
	});
	// Remaining references (parent, home, split source, param refs) are nulled by the FKs.
	await tx.item.deleteMany({ where: { id: { in: ids } } });
}

export interface ArchivedItem {
	id: string;
	name: string;
	quantity: number;
	archivedAt: Date | null;
	/** Where it lay when archived. */
	path: PathNode[];
	stickerCode: string | null;
}

/** Archived items, most recently archived first. */
export async function listArchive(actor: Actor): Promise<ArchivedItem[]> {
	const items = await db.item.findMany({
		where: { status: 'ARCHIVED', isWorkbench: false, ...visibleTo(actor) },
		include: { type: { select: { name: true } }, sticker: { select: { code: true } } },
		orderBy: [{ archivedAt: 'desc' }, { id: 'asc' }]
	});
	const paths = await getPaths(items.map((i) => i.id));
	return items.map((i) => ({
		id: i.id,
		name: itemDisplayName(i),
		quantity: i.quantity,
		archivedAt: i.archivedAt,
		path: paths.get(i.id) ?? [],
		stickerCode: i.sticker?.code ?? null
	}));
}
