import { db } from '$lib/server/db';
import { NotFoundError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { getPaths, type PathNode } from './paths';

/** A container offered in «Куда?» before anything is typed. */
export interface PlaceSuggestion {
	itemId: string;
	name: string;
	stickerCode: string | null;
	path: PathNode[];
}

/** How many containers each list offers. */
const LIMIT = 4;
/** How far back the history is read for recent places. */
const RECENT_EVENTS = 200;

/** History events that put something into a place (`data.to`). */
const PUT_KINDS = ['item.moved', 'item.returned', 'item.created'];

/**
 * Places for «Переложить» while «Куда?» is empty: containers things were
 * recently put into (by the history) and containers lying next to the item
 * (where it lies, or where it was taken from while on a workbench). The item
 * itself, its contents and the container it lies in are not offered.
 */
export async function suggestPlaces(
	actor: Actor,
	itemId: string
): Promise<{ recent: PlaceSuggestion[]; nearby: PlaceSuggestion[] }> {
	const item = await db.item.findFirst({ where: { id: itemId, ...visibleTo(actor) } });
	if (!item) throw new NotFoundError('Вещь не найдена');
	const here = item.takenById ? item.homeId : item.parentId;

	const events = await db.historyEvent.findMany({
		where: { ...visibleTo(actor), kind: { in: PUT_KINDS } },
		orderBy: { createdAt: 'desc' },
		take: RECENT_EVENTS,
		select: { data: true }
	});
	const recentIds = [
		...new Set(
			events
				.map((e) => (e.data as { to?: { id?: unknown } | null }).to?.id)
				.filter((id): id is string => typeof id === 'string')
		)
	];

	const container = {
		...visibleTo(actor),
		status: 'ACTIVE' as const,
		isWorkbench: false,
		type: { isContainer: true },
		id: { notIn: [item.id, ...(item.parentId && !item.takenById ? [item.parentId] : [])] }
	};
	const include = { type: { select: { name: true } }, sticker: true } as const;
	const [recentRows, nearbyRows] = await Promise.all([
		db.item.findMany({ where: { ...container, AND: [{ id: { in: recentIds } }] }, include }),
		db.item.findMany({ where: { ...container, parentId: here }, include })
	]);

	const paths = await getPaths([...recentRows, ...nearbyRows].map((r) => r.id));
	const toSuggestion = (row: (typeof recentRows)[number]): PlaceSuggestion => ({
		itemId: row.id,
		name: itemDisplayName(row),
		stickerCode: row.sticker?.status === 'BOUND' ? row.sticker.code : null,
		path: paths.get(row.id) ?? []
	});
	// Not into its own contents.
	const outside = (s: PlaceSuggestion) => !s.path.some((p) => p.id === item.id);

	const order = new Map(recentIds.map((id, i) => [id, i]));
	const recent = recentRows
		.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
		.map(toSuggestion)
		.filter(outside)
		.slice(0, LIMIT);
	const nearby = nearbyRows
		.map(toSuggestion)
		.filter((s) => outside(s) && !recent.some((r) => r.itemId === s.itemId))
		.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
		.slice(0, LIMIT);
	return { recent, nearby };
}
