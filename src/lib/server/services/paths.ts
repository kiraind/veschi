import { Prisma } from '@prisma/client';
import { db, type Tx } from '$lib/server/db';
import { ValidationError } from '$lib/server/errors';
import { itemDisplayName } from '$lib/domain/item';

export interface PathNode {
	id: string;
	name: string;
	isWorkbench: boolean;
}

/**
 * Container paths for many items at once: for each item id, its ancestors
 * from the top level down to the direct parent (the item itself excluded).
 * Items at the top level get an empty path.
 */
export async function getPaths(itemIds: string[], tx: Tx = db): Promise<Map<string, PathNode[]>> {
	const result = new Map<string, PathNode[]>(itemIds.map((id) => [id, []]));
	if (itemIds.length === 0) return result;
	const rows = await tx.$queryRaw<
		{ start_id: string; id: string; name: string; is_workbench: boolean; depth: number }[]
	>`
		WITH RECURSIVE chain AS (
			SELECT i.id AS start_id, i."parentId" AS id, 1 AS depth
			FROM "Item" i
			WHERE i.id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}`))})
				AND i."parentId" IS NOT NULL
			UNION ALL
			SELECT c.start_id, p."parentId", c.depth + 1
			FROM chain c
			JOIN "Item" p ON p.id = c.id
			WHERE p."parentId" IS NOT NULL AND c.depth < 100
		)
		SELECT c.start_id::text, a.id::text, COALESCE(NULLIF(TRIM(a.name), ''), t.name, 'Без названия') AS name,
			a."isWorkbench" AS is_workbench, c.depth
		FROM chain c
		JOIN "Item" a ON a.id = c.id
		LEFT JOIN "ItemType" t ON t.id = a."typeId"
		ORDER BY c.start_id, c.depth DESC
	`;
	for (const row of rows) {
		result.get(row.start_id)?.push({ id: row.id, name: row.name, isWorkbench: row.is_workbench });
	}
	return result;
}

export async function getPath(itemId: string, tx: Tx = db): Promise<PathNode[]> {
	return (await getPaths([itemId], tx)).get(itemId) ?? [];
}

/** True when `candidateId` is `itemId` itself or lies (at any depth) inside it. */
export async function isSelfOrDescendant(
	itemId: string,
	candidateId: string,
	tx: Tx = db
): Promise<boolean> {
	if (itemId === candidateId) return true;
	const path = await getPath(candidateId, tx);
	return path.some((node) => node.id === itemId);
}

/** Throws when putting `itemId` into `newParentId` would create a cycle. */
export async function assertCanPlace(
	itemId: string,
	newParentId: string | null,
	tx: Tx = db
): Promise<void> {
	if (newParentId && (await isSelfOrDescendant(itemId, newParentId, tx))) {
		throw new ValidationError('Нельзя положить вещь в саму себя или в её содержимое');
	}
}

/** Things can be put into workbenches and items of a container type. */
export function isContainerItem(item: {
	isWorkbench: boolean;
	type?: { isContainer: boolean } | null;
}): boolean {
	return item.isWorkbench || Boolean(item.type?.isContainer);
}

/** Prisma include giving what `isContainerItem` and `assertIsContainer` need. */
export const containerTypeInclude = {
	type: { select: { name: true, isContainer: true } }
} as const;

/** Throws unless things can be put into `item`. */
export function assertIsContainer(item: {
	isWorkbench: boolean;
	name: string | null;
	type?: { name: string; isContainer: boolean } | null;
}): void {
	if (!isContainerItem(item)) {
		throw new ValidationError(
			`«${itemDisplayName(item)}» — не контейнер. Отметьте у её типа «Контейнер», чтобы класть внутрь`
		);
	}
}

/** Active things inside the containers, and things from them taken to a workbench. */
export async function countContents(
	containerIds: string | string[],
	tx: Tx = db
): Promise<{ inside: number; taken: number }> {
	const ids = Array.isArray(containerIds) ? containerIds : [containerIds];
	const [inside, taken] = await Promise.all([
		tx.item.count({ where: { parentId: { in: ids }, status: 'ACTIVE' } }),
		tx.item.count({ where: { homeId: { in: ids }, status: 'ACTIVE', takenById: { not: null } } })
	]);
	return { inside, taken };
}

/** Throws when something lies in the container or was taken from it to a workbench. */
export async function assertNothingInside(containerIds: string | string[], tx: Tx): Promise<void> {
	const { inside, taken } = await countContents(containerIds, tx);
	if (inside > 0) throw new ValidationError('Внутри лежат вещи — сначала переложите их');
	if (taken > 0) {
		throw new ValidationError('Вещи из него лежат на рабочем столе — сначала верните их');
	}
}
