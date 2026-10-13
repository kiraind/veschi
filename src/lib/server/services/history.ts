import type { Prisma } from '@prisma/client';
import { db, type Tx } from '$lib/server/db';
import { visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import {
	kindsOfGroup,
	type EntityRef,
	type HistoryData,
	type HistoryFilters,
	type HistoryKind,
	type HistoryPage,
	type Place,
	type SubjectKind
} from '$lib/domain/history';

/** Ownership columns of the record an event is about. */
export interface Scope {
	ownerId: string | null;
	householdId: string | null;
}

export interface NewEvent<K extends HistoryKind> {
	kind: K;
	/** The record the event is about; its scope becomes the event's scope. */
	subject: EntityRef & Scope;
	data: HistoryData<K>;
	/** Other entities involved; places and resultId in `data` are added automatically. */
	refIds?: string[];
}

/**
 * Writes one history event. Called by the service that made the change, in
 * the same transaction, so a rolled-back change leaves no event.
 */
export async function recordEvent<K extends HistoryKind>(
	tx: Tx,
	actor: Actor,
	{ kind, subject, data, refIds = [] }: NewEvent<K>
): Promise<void> {
	const d: Record<string, unknown> = { ...data };
	if (d.resultId === subject.id) delete d.resultId;
	const involved = new Set(refIds);
	for (const key of ['from', 'to']) {
		const place = d[key] as Place | undefined;
		if (place) involved.add(place.id);
	}
	if (typeof d.resultId === 'string') involved.add(d.resultId);
	involved.delete(subject.id);
	await tx.historyEvent.create({
		data: {
			ownerId: subject.ownerId,
			householdId: subject.householdId,
			actorId: actor.userId,
			kind,
			subjectKind: subject.kind,
			subjectId: subject.id,
			subjectName: subject.name,
			refIds: [...involved],
			data: d as Prisma.InputJsonObject
		}
	});
}

type ItemLike = Scope & {
	id: string;
	name: string | null;
	isWorkbench: boolean;
	type?: { name: string } | null;
};

/** An item or workbench as an event subject or place. */
export function itemRef(item: ItemLike): EntityRef & Scope {
	return {
		id: item.id,
		name: item.isWorkbench ? (item.name ?? '') : itemDisplayName(item),
		kind: item.isWorkbench ? 'workbench' : 'item',
		ownerId: item.ownerId,
		householdId: item.householdId
	};
}

/** The place an item lies in (null = top level), with its current name. */
export async function placeRef(tx: Tx, id: string | null): Promise<Place> {
	if (!id) return null;
	const item = await tx.item.findUnique({
		where: { id },
		include: { type: { select: { name: true } } }
	});
	if (!item) return null;
	const { ownerId: _o, householdId: _h, ...ref } = itemRef(item);
	return ref;
}

/** Subject of an event about an item, loaded by id (with its type name). */
export async function itemSubject(tx: Tx, id: string): Promise<EntityRef & Scope> {
	const item = await tx.item.findUniqueOrThrow({
		where: { id },
		include: { type: { select: { name: true } } }
	});
	return itemRef(item);
}

export function typeRef(type: Scope & { id: string; name: string }): EntityRef & Scope {
	return {
		id: type.id,
		name: type.name,
		kind: 'type',
		ownerId: type.ownerId,
		householdId: type.householdId
	};
}

export function categoryRef(category: Scope & { id: string; name: string }): EntityRef & Scope {
	return {
		id: category.id,
		name: category.name,
		kind: 'category',
		ownerId: category.ownerId,
		householdId: category.householdId
	};
}

export function collectionRef(collection: Scope & { id: string; name: string }): EntityRef & Scope {
	return {
		id: collection.id,
		name: collection.name,
		kind: 'collection',
		ownerId: collection.ownerId,
		householdId: collection.householdId
	};
}

export function paramDefRef(def: Scope & { id: string; name: string }): EntityRef & Scope {
	return {
		id: def.id,
		name: def.name,
		kind: 'paramDef',
		ownerId: def.ownerId,
		householdId: def.householdId
	};
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const HISTORY_PAGE_SIZE = 50;

function filterWhere(actor: Actor, f: HistoryFilters): Prisma.HistoryEventWhereInput {
	const and: Prisma.HistoryEventWhereInput[] = [visibleTo(actor)];
	if (f.entity) and.push({ OR: [{ subjectId: f.entity }, { refIds: { has: f.entity } }] });
	if (f.actor) and.push({ actorId: f.actor });
	if (f.group) and.push({ kind: { in: kindsOfGroup(f.group) } });
	if (f.subject) and.push({ subjectKind: f.subject });
	return { AND: and };
}

/** Ids among `ids` that still exist and are visible to the actor. */
async function liveIds(actor: Actor, ids: string[]): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const where = { id: { in: ids }, ...visibleTo(actor) };
	const select = { id: true } as const;
	const rows = await Promise.all([
		db.item.findMany({ where, select }),
		db.itemType.findMany({ where, select }),
		db.paramDef.findMany({ where, select }),
		db.category.findMany({ where, select }),
		db.collection.findMany({ where, select }),
		db.stickerBatch.findMany({ where, select })
	]);
	return new Set(rows.flat().map((r) => r.id));
}

/** Events newest first, `HISTORY_PAGE_SIZE` at a time; `before` is a cursor from the previous page. */
export async function listHistory(
	actor: Actor,
	filters: HistoryFilters,
	before: string | null = null
): Promise<HistoryPage> {
	const where = filterWhere(actor, filters);
	let cursorWhere: Prisma.HistoryEventWhereInput = {};
	if (before) {
		const cursor = await db.historyEvent.findFirst({
			where: { id: before, ...visibleTo(actor) },
			select: { id: true, createdAt: true }
		});
		if (cursor) {
			cursorWhere = {
				OR: [
					{ createdAt: { lt: cursor.createdAt } },
					{ createdAt: cursor.createdAt, id: { lt: cursor.id } }
				]
			};
		}
	}
	const rows = await db.historyEvent.findMany({
		where: { AND: [where, cursorWhere] },
		include: { actor: { select: { id: true, name: true } } },
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: HISTORY_PAGE_SIZE + 1
	});
	const page = rows.slice(0, HISTORY_PAGE_SIZE);
	const live = await liveIds(actor, [...new Set(page.flatMap((r) => [r.subjectId, ...r.refIds]))]);
	return {
		events: page.map((r) => ({
			id: r.id,
			kind: r.kind as HistoryKind,
			subjectKind: r.subjectKind as SubjectKind,
			subjectId: r.subjectId,
			subjectName: r.subjectName,
			data: r.data as unknown as HistoryData,
			createdAt: r.createdAt,
			actor: r.actor,
			live: [r.subjectId, ...r.refIds].filter((id) => live.has(id))
		})),
		nextCursor: rows.length > HISTORY_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null
	};
}

/** People who appear in the actor's history (for the «Кто» filter). */
export async function listHistoryActors(actor: Actor): Promise<{ id: string; name: string }[]> {
	// groupBy is a GROUP BY in SQL; findMany with `distinct` would read every event.
	const groups = await db.historyEvent.groupBy({
		by: ['actorId'],
		where: { ...visibleTo(actor), actorId: { not: null } }
	});
	const users = await db.user.findMany({
		where: { id: { in: groups.flatMap((g) => (g.actorId ? [g.actorId] : [])) } },
		select: { id: true, name: true }
	});
	return users.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Name and kind of the entity in the `entity` filter: the record itself when
 * it still exists, otherwise the latest event about it.
 */
export async function describeEntity(
	actor: Actor,
	id: string
): Promise<{ name: string; kind: SubjectKind | null }> {
	const scope = visibleTo(actor);
	const named = { where: { id, ...scope }, select: { name: true } } as const;
	const [item, type, def, category, collection, last] = await Promise.all([
		db.item.findFirst({
			where: { id, ...scope },
			include: { type: { select: { name: true } } }
		}),
		db.itemType.findFirst(named),
		db.paramDef.findFirst(named),
		db.category.findFirst(named),
		db.collection.findFirst(named),
		db.historyEvent.findFirst({
			where: { subjectId: id, ...scope },
			orderBy: { createdAt: 'desc' }
		})
	]);
	if (item) {
		const { name, kind } = itemRef(item);
		return { name, kind };
	}
	if (type) return { name: type.name, kind: 'type' };
	if (def) return { name: def.name, kind: 'paramDef' };
	if (category) return { name: category.name, kind: 'category' };
	if (collection) return { name: collection.name, kind: 'collection' };
	if (last) return { name: last.subjectName, kind: last.subjectKind as SubjectKind };
	return { name: 'неизвестно что', kind: null };
}
