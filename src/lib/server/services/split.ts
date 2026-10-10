import type { Item } from '@prisma/client';
import type { Tx } from '$lib/server/db';
import { ValidationError } from '$lib/server/errors';
import { quantityError } from '$lib/domain/workbench';

/** Where a moved part ends up and whether it counts as taken to a workbench. */
export interface Placement {
	parentId: string | null;
	takenById: string | null;
	takenAt: Date | null;
	homeId: string | null;
	/** Omitted → a whole record keeps its own splitFromId. */
	splitFromId?: string | null;
}

/** Placement for parts that are put away, not taken: they forget any workbench state. */
export const notTaken = {
	takenById: null,
	takenAt: null,
	homeId: null,
	splitFromId: null
} as const;

/** Validates the requested part (omitted = the whole record) and returns it. */
export function partCount(item: Pick<Item, 'quantity'>, quantity: number | undefined): number {
	const count = quantity ?? item.quantity;
	const problem = quantityError(item.quantity, count);
	if (problem) throw new ValidationError(problem);
	return count;
}

/**
 * Moves `count` of an item to `placement`. The whole quantity moves the
 * record itself (with its sticker, params and contents). A part splits the
 * record: the source keeps the rest, its sticker, its own params and its
 * place; the part is a new record with the same owner, household, type and
 * name. With `rememberSource` the part points back to the source (splitFromId)
 * so it can merge back later. Returns the id of the record that moved.
 */
export async function placePart(
	tx: Tx,
	item: Item,
	count: number,
	placement: Placement,
	{ rememberSource = false }: { rememberSource?: boolean } = {}
): Promise<string> {
	if (count === item.quantity) {
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
			splitFromId: rememberSource ? (item.splitFromId ?? item.id) : (placement.splitFromId ?? null)
		}
	});
	return part.id;
}
