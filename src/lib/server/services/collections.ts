import type { Prisma } from '@prisma/client';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { diffFields, type EntityRef } from '$lib/domain/history';
import {
	MAX_COLLECTION_ENTRIES,
	MAX_ENTRY_QUANTITY,
	collectionInputSchema,
	collectionUpdateSchema,
	entryInputSchema,
	entryUpdateSchema,
	totalShortage,
	type CollectionEntryView,
	type CollectionRef,
	type CollectionSummary
} from '$lib/domain/collections';
import { collectionRef, itemRef, recordEvent } from './history';
import { assertNameFree } from './names';
import { getPaths } from './paths';
import { findOrCreateType } from './types';

/** How many photos a row of the «Коллекции» list shows. */
const LIST_PHOTOS = 5;

const entryInclude = {
	type: { select: { id: true, name: true, photoKey: true, isContainer: true } },
	item: {
		include: {
			type: { select: { name: true, photoKey: true, isContainer: true } },
			sticker: { select: { code: true, status: true } }
		}
	}
} satisfies Prisma.CollectionEntryInclude;

type EntryRow = Prisma.CollectionEntryGetPayload<{ include: typeof entryInclude }>;

async function findCollection(actor: Actor, id: string, tx: Tx = db) {
	const collection = await tx.collection.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!collection) throw new NotFoundError('Коллекция не найдена');
	return collection;
}

/**
 * Lines as the pages show them, with what there is of each: for a type, the
 * active items of it in every place (workbenches included); for an item, its
 * record's quantity and place.
 */
async function entryViews(actor: Actor, rows: EntryRow[], tx: Tx = db) {
	const typeIds = [...new Set(rows.flatMap((r) => (r.typeId ? [r.typeId] : [])))];
	const itemIds = rows.flatMap((r) => (r.item && r.item.status === 'ACTIVE' ? [r.item.id] : []));
	const [stock, paths] = await Promise.all([
		typeIds.length
			? tx.item.groupBy({
					by: ['typeId'],
					where: {
						typeId: { in: typeIds },
						status: 'ACTIVE',
						isWorkbench: false,
						...visibleTo(actor)
					},
					_sum: { quantity: true }
				})
			: [],
		getPaths(itemIds, tx)
	]);
	const have = new Map(stock.map((s) => [s.typeId, s._sum.quantity ?? 0]));
	return rows.flatMap((r): CollectionEntryView[] => {
		if (r.type) {
			return [
				{
					id: r.id,
					kind: 'type',
					targetId: r.type.id,
					name: r.type.name,
					typeName: null,
					photoKey: r.type.photoKey,
					isContainer: r.type.isContainer,
					stickerCode: null,
					quantity: r.quantity,
					stock: { kind: 'type', have: have.get(r.type.id) ?? 0 }
				}
			];
		}
		if (r.item) {
			const name = itemDisplayName(r.item);
			const typeName = r.item.type?.name ?? null;
			return [
				{
					id: r.id,
					kind: 'item',
					targetId: r.item.id,
					name,
					typeName: typeName && typeName !== name ? typeName : null,
					photoKey: r.item.type?.photoKey ?? null,
					isContainer: r.item.type?.isContainer ?? false,
					stickerCode: r.item.sticker?.status === 'BOUND' ? r.item.sticker.code : null,
					quantity: r.quantity,
					stock: {
						kind: 'item',
						have: r.item.quantity,
						archived: r.item.status === 'ARCHIVED',
						path: paths.get(r.item.id) ?? []
					}
				}
			];
		}
		return [];
	});
}

/** Collections sorted by name, with their line counts and what is short. */
export async function listCollections(actor: Actor): Promise<CollectionSummary[]> {
	const collections = await db.collection.findMany({
		where: visibleTo(actor),
		include: { entries: { include: entryInclude, orderBy: { position: 'asc' } } },
		orderBy: { name: 'asc' }
	});
	const views = await entryViews(
		actor,
		collections.flatMap((c) => c.entries)
	);
	const byId = new Map(views.map((v) => [v.id, v]));
	return collections.map((c) => {
		const entries = c.entries.flatMap((e) => byId.get(e.id) ?? []);
		return {
			id: c.id,
			name: c.name,
			description: c.description,
			entryCount: entries.length,
			missing: totalShortage(entries),
			photos: entries
				.slice(0, LIST_PHOTOS)
				.map((e) => ({ photoKey: e.photoKey, isContainer: e.isContainer }))
		};
	});
}

export interface CollectionCard {
	collection: { id: string; name: string; description: string | null };
	/** Lines in the order they were added. */
	entries: CollectionEntryView[];
}

export async function getCollectionCard(actor: Actor, id: string): Promise<CollectionCard> {
	const collection = await findCollection(actor, id);
	const rows = await db.collectionEntry.findMany({
		where: { collectionId: id },
		include: entryInclude,
		orderBy: { position: 'asc' }
	});
	return {
		collection: { id: collection.id, name: collection.name, description: collection.description },
		entries: await entryViews(actor, rows)
	};
}

export async function createCollection(actor: Actor, input: unknown): Promise<CollectionRef> {
	const { name, description } = collectionInputSchema.parse(input);
	return writeTransaction(async (tx) => {
		await assertNameFree('collection', actor, name, null, tx);
		const collection = await tx.collection.create({
			data: { name, description, ...ownedBy(actor) }
		});
		await recordEvent(tx, actor, {
			kind: 'collection.created',
			subject: collectionRef(collection),
			data: {}
		});
		return { id: collection.id, name: collection.name };
	});
}

/** Renames a collection or changes its description. */
export async function updateCollection(actor: Actor, id: string, input: unknown): Promise<void> {
	const { name, description } = collectionUpdateSchema.parse(input);
	await writeTransaction(async (tx) => {
		const collection = await findCollection(actor, id, tx);
		if (name !== undefined) await assertNameFree('collection', actor, name, id, tx);
		const updated = await tx.collection.update({ where: { id }, data: { name, description } });
		const changes = diffFields(
			{ name: collection.name, description: collection.description },
			{ name, description }
		);
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'collection.updated',
				subject: collectionRef(updated),
				data: { changes }
			});
		}
	});
}

/** Deletes a collection: only the list goes, its types and items stay. */
export async function deleteCollection(actor: Actor, id: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const collection = await findCollection(actor, id, tx);
		const entries = await tx.collectionEntry.count({ where: { collectionId: id } });
		await recordEvent(tx, actor, {
			kind: 'collection.deleted',
			subject: collectionRef(collection),
			data: entries ? { entries } : {}
		});
		await tx.collection.delete({ where: { id } });
	});
}

/** The type or item of a line as the history names it. */
function targetOf(row: EntryRow): EntityRef {
	if (row.item) {
		const { ownerId: _o, householdId: _h, ...ref } = itemRef(row.item);
		return ref;
	}
	return { id: row.type!.id, name: row.type!.name, kind: 'type' };
}

/**
 * Adds a type or an item to a collection, or adds to its quantity when it is
 * already there. `typeName` finds the type by name or creates it — for things
 * the collection needs and nobody has yet.
 */
export async function addEntry(
	actor: Actor,
	collectionId: string,
	input: unknown
): Promise<{ id: string }> {
	const { typeId, typeName, itemId, quantity } = entryInputSchema.parse(input);
	return writeTransaction(async (tx) => {
		const collection = await findCollection(actor, collectionId, tx);
		let target: { typeId: string } | { itemId: string };
		let archived = false;
		if (itemId) {
			const item = await tx.item.findFirst({ where: { id: itemId, ...visibleTo(actor) } });
			if (!item) throw new NotFoundError('Вещь не найдена');
			if (item.isWorkbench) throw new ValidationError('Рабочий стол нельзя добавить в коллекцию');
			archived = item.status !== 'ACTIVE';
			target = { itemId };
		} else if (typeId) {
			const type = await tx.itemType.findFirst({ where: { id: typeId, ...visibleTo(actor) } });
			if (!type) throw new NotFoundError('Тип не найден');
			target = { typeId };
		} else {
			target = { typeId: (await findOrCreateType(actor, typeName!, tx)).id };
		}

		const existing = await tx.collectionEntry.findFirst({
			where: { collectionId, ...target },
			include: entryInclude
		});
		// A line kept from before may stay (and grow) after its item went to the archive.
		if (archived && !existing) throw new ValidationError('Вещь в архиве');
		let row: EntryRow;
		if (existing) {
			row = await tx.collectionEntry.update({
				where: { id: existing.id },
				data: { quantity: Math.min(existing.quantity + quantity, MAX_ENTRY_QUANTITY) },
				include: entryInclude
			});
		} else {
			const count = await tx.collectionEntry.count({ where: { collectionId } });
			if (count >= MAX_COLLECTION_ENTRIES) {
				throw new ValidationError(`В коллекции не больше ${MAX_COLLECTION_ENTRIES} позиций`);
			}
			const last = await tx.collectionEntry.findFirst({
				where: { collectionId },
				orderBy: { position: 'desc' },
				select: { position: true }
			});
			row = await tx.collectionEntry.create({
				data: { collectionId, ...target, quantity, position: (last?.position ?? -1) + 1 },
				include: entryInclude
			});
		}
		const ref = targetOf(row);
		await recordEvent(tx, actor, {
			kind: 'collection.entry',
			subject: collectionRef(collection),
			data: existing
				? { target: ref, change: 'quantity', quantity: row.quantity, before: existing.quantity }
				: { target: ref, change: 'added', quantity: row.quantity },
			refIds: [ref.id]
		});
		return { id: row.id };
	});
}

async function findEntry(actor: Actor, collectionId: string, entryId: string, tx: Tx) {
	const collection = await findCollection(actor, collectionId, tx);
	const entry = await tx.collectionEntry.findFirst({
		where: { id: entryId, collectionId },
		include: entryInclude
	});
	if (!entry) throw new NotFoundError('Такой позиции в коллекции нет');
	return { collection, entry };
}

/** Sets how many of a line the collection needs. */
export async function updateEntry(
	actor: Actor,
	collectionId: string,
	entryId: string,
	input: unknown
): Promise<void> {
	const { quantity } = entryUpdateSchema.parse(input);
	await writeTransaction(async (tx) => {
		const { collection, entry } = await findEntry(actor, collectionId, entryId, tx);
		if (entry.quantity === quantity) return;
		await tx.collectionEntry.update({ where: { id: entryId }, data: { quantity } });
		const ref = targetOf(entry);
		await recordEvent(tx, actor, {
			kind: 'collection.entry',
			subject: collectionRef(collection),
			data: { target: ref, change: 'quantity', quantity, before: entry.quantity },
			refIds: [ref.id]
		});
	});
}

export async function removeEntry(
	actor: Actor,
	collectionId: string,
	entryId: string
): Promise<void> {
	await writeTransaction(async (tx) => {
		const { collection, entry } = await findEntry(actor, collectionId, entryId, tx);
		await tx.collectionEntry.delete({ where: { id: entryId } });
		const ref = targetOf(entry);
		await recordEvent(tx, actor, {
			kind: 'collection.entry',
			subject: collectionRef(collection),
			data: { target: ref, change: 'removed', quantity: entry.quantity },
			refIds: [ref.id]
		});
	});
}

/** A collection a type or item is in, with its line there (for the chips on their cards). */
export interface EntryOf extends CollectionRef {
	entryId: string;
	quantity: number;
}

/** Collections a type (its own line, not lines of its items) or an item is in, by name. */
export async function collectionsOf(
	actor: Actor,
	target: { typeId: string } | { itemId: string }
): Promise<EntryOf[]> {
	const rows = await db.collectionEntry.findMany({
		where: { ...target, collection: visibleTo(actor) },
		include: { collection: { select: { id: true, name: true } } },
		orderBy: { collection: { name: 'asc' } }
	});
	return rows.map((r) => ({
		id: r.collection.id,
		name: r.collection.name,
		entryId: r.id,
		quantity: r.quantity
	}));
}

/** «в коллекции «Умные весы»», «в коллекциях «А» и «Б»» — why a type or item can't be deleted. */
export async function collectionNamesHolding(
	tx: Tx,
	target: { typeId: string } | { itemId: { in: string[] } }
): Promise<string | null> {
	const rows = await tx.collectionEntry.findMany({
		where: target,
		select: { collection: { select: { name: true } } },
		distinct: ['collectionId'],
		orderBy: { collection: { name: 'asc' } }
	});
	if (rows.length === 0) return null;
	const names = rows.map((r) => `«${r.collection.name}»`);
	return names.length === 1
		? `в коллекции ${names[0]}`
		: `в коллекциях ${names.slice(0, -1).join(', ')} и ${names.at(-1)}`;
}
