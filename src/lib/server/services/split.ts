import type { Item } from '@prisma/client';
import type { Tx } from '$lib/server/db';
import { ValidationError } from '$lib/server/errors';
import { quantityError } from '$lib/domain/workbench';
import { mirrorLinksOf } from './params';

/** Where a moved part ends up and whether it counts as taken to a workbench. */
export interface Placement {
	parentId: string | null;
	takenById: string | null;
	takenAt: Date | null;
	homeId: string | null;
	/** Created right on a workbench and not put anywhere since; omitted = false. */
	createdOnBench?: boolean;
	/** Omitted → a whole record keeps its own splitFromId. */
	splitFromId?: string | null;
}

/** Placement for parts that are put away, not taken: they forget any workbench state. */
export const notTaken = {
	takenById: null,
	takenAt: null,
	homeId: null,
	createdOnBench: false,
	splitFromId: null
} as const;

/** Validates the requested part (omitted = the whole record) and returns it. */
export function partCount(item: Pick<Item, 'quantity'>, quantity: number | undefined): number {
	const count = quantity ?? item.quantity;
	const problem = quantityError(item.quantity, count);
	if (problem) throw new ValidationError(problem);
	return count;
}

/** Own parameter values of items as comparable strings (empty = none). */
async function paramSignatures(tx: Tx, ids: string[]): Promise<Map<string, string>> {
	const rows = await tx.param.findMany({
		where: { itemId: { in: ids } },
		include: {
			enumValues: { select: { optionId: true } },
			refs: { select: { itemId: true, typeId: true } }
		},
		orderBy: { defId: 'asc' }
	});
	const result = new Map<string, string[]>(ids.map((id) => [id, []]));
	for (const r of rows) {
		result
			.get(r.itemId ?? '')
			?.push(
				JSON.stringify([
					r.defId,
					r.textValue,
					r.numberValue,
					r.numberMax,
					r.dateValue?.toISOString() ?? null,
					r.boolValue,
					r.fileKey,
					r.enumValues.map((v) => v.optionId).sort(),
					r.refs.map((ref) => ref.itemId ?? ref.typeId).sort()
				])
			);
	}
	return new Map([...result].map(([id, parts]) => [id, parts.join(';')]));
}

/**
 * Gives `toId` copies of the own parameter values of `fromId`; what its links
 * point at gets `toId` in the inverse values too.
 */
async function copyOwnParams(tx: Tx, fromId: string, toId: string): Promise<void> {
	const params = await tx.param.findMany({
		where: { itemId: fromId },
		include: {
			enumValues: { select: { optionId: true } },
			refs: { select: { itemId: true, typeId: true } }
		}
	});
	for (const {
		id: _id,
		itemId: _item,
		createdAt: _c,
		updatedAt: _u,
		enumValues,
		refs,
		...p
	} of params) {
		await tx.param.create({
			data: { ...p, itemId: toId, enumValues: { create: enumValues }, refs: { create: refs } }
		});
	}
	await mirrorLinksOf({ itemId: toId }, tx);
}

/**
 * Can a record be dissolved into an identical one? Not when it is a
 * container or a workbench, or something points at it: a sticker, contents,
 * a link from a parameter, a collection.
 */
export async function isPlainRecord(tx: Tx, id: string): Promise<boolean> {
	const item = await tx.item.findUnique({
		where: { id },
		include: {
			type: { select: { isContainer: true } },
			sticker: { select: { id: true } },
			_count: { select: { children: true, paramRefs: true, collectionEntries: true } }
		}
	});
	return Boolean(
		item &&
		!item.isWorkbench &&
		!item.type?.isContainer &&
		!item.sticker &&
		item._count.children === 0 &&
		item._count.paramRefs === 0 &&
		item._count.collectionEntries === 0
	);
}

/**
 * An active record that `count` of `item` placed at `placement` would
 * duplicate: same owner, type, own name, place, workbench state and own
 * parameter values, with nothing pointing at it. What moves must be plain
 * too: a part always is (unless its type is a container), a whole record
 * only without a sticker, contents or references. Null when there is none.
 */
async function findTwin(
	tx: Tx,
	item: Item,
	whole: boolean,
	placement: Placement & { splitFromId: string | null }
): Promise<Item | null> {
	if (whole ? !(await isPlainRecord(tx, item.id)) : !(await isPlainType(tx, item.typeId))) {
		return null;
	}
	const candidates = await tx.item.findMany({
		where: {
			id: { not: item.id },
			status: 'ACTIVE',
			isWorkbench: false,
			ownerId: item.ownerId,
			householdId: item.householdId,
			typeId: item.typeId,
			name: item.name,
			parentId: placement.parentId,
			takenById: placement.takenById,
			homeId: placement.homeId,
			createdOnBench: placement.createdOnBench ?? false,
			splitFromId: placement.splitFromId,
			sticker: null,
			children: { none: {} },
			paramRefs: { none: {} },
			collectionEntries: { none: {} }
		},
		orderBy: { createdAt: 'asc' }
	});
	if (candidates.length === 0) return null;
	const signatures = await paramSignatures(tx, [item.id, ...candidates.map((c) => c.id)]);
	const own = signatures.get(item.id);
	return candidates.find((c) => signatures.get(c.id) === own) ?? null;
}

/**
 * Do two records hold the same thing: the same type, own name and own
 * parameter values? Only such records may become one.
 */
export async function sameThing(
	tx: Tx,
	a: Pick<Item, 'id' | 'typeId' | 'name'>,
	b: Pick<Item, 'id' | 'typeId' | 'name'>
): Promise<boolean> {
	if (a.typeId !== b.typeId || a.name !== b.name) return false;
	const signatures = await paramSignatures(tx, [a.id, b.id]);
	return signatures.get(a.id) === signatures.get(b.id);
}

async function isPlainType(tx: Tx, typeId: string | null): Promise<boolean> {
	if (!typeId) return false;
	const type = await tx.itemType.findUnique({ where: { id: typeId } });
	return Boolean(type && !type.isContainer);
}

/**
 * Moves `count` of an item to `placement`. The whole quantity moves the
 * record itself (with its sticker, params and contents). A part splits the
 * record: the source keeps the rest, its sticker and its place; the part is a
 * new record with the same owner, household, type, name and own parameter
 * values. With `rememberSource` the part points back to the source
 * (splitFromId) so it can merge back later.
 *
 * When an identical record already lies at the destination (see `findTwin`),
 * what moves is added to its quantity instead of lying there as a second
 * record; a whole record is then deleted (it has no sticker or contents).
 * `merge: false` always keeps the part a record of its own.
 * Returns the id of the record that holds what moved.
 */
export async function placePart(
	tx: Tx,
	item: Item,
	count: number,
	placement: Placement,
	{ rememberSource = false, merge = true }: { rememberSource?: boolean; merge?: boolean } = {}
): Promise<string> {
	const whole = count === item.quantity;
	const splitFromId = whole
		? placement.splitFromId === undefined
			? item.splitFromId
			: placement.splitFromId
		: rememberSource
			? (item.splitFromId ?? item.id)
			: (placement.splitFromId ?? null);
	const twin = merge ? await findTwin(tx, item, whole, { ...placement, splitFromId }) : null;
	if (twin) {
		await tx.item.update({ where: { id: twin.id }, data: { quantity: twin.quantity + count } });
		if (whole) {
			// Parts taken from the dissolved record now belong to the twin (they merge back into it).
			await tx.item.updateMany({ where: { splitFromId: item.id }, data: { splitFromId: twin.id } });
			await tx.item.delete({ where: { id: item.id } });
		} else
			await tx.item.update({ where: { id: item.id }, data: { quantity: item.quantity - count } });
		return twin.id;
	}
	if (whole) {
		await tx.item.update({ where: { id: item.id }, data: placement });
		return item.id;
	}
	await tx.item.update({ where: { id: item.id }, data: { quantity: item.quantity - count } });
	// The part belongs to whoever owns the source (a shared item stays shared).
	const part = await tx.item.create({
		data: {
			ownerId: item.ownerId,
			householdId: item.householdId,
			typeId: item.typeId,
			name: item.name,
			quantity: count,
			...placement,
			splitFromId
		}
	});
	await copyOwnParams(tx, item.id, part.id);
	return part.id;
}
