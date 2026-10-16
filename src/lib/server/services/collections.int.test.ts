import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import {
	addEntry,
	collectionsOf,
	createCollection,
	deleteCollection,
	getCollectionCard,
	listCollections,
	removeEntry,
	updateCollection,
	updateEntry
} from './collections';
import { discard, purge } from './archive';
import { listHistory } from './history';
import { createItem, moveItem } from './items';
import { createType, deleteType } from './types';
import { createWorkbench } from './workbench';

describe('collections', () => {
	let actor: Actor;
	let scales: { id: string; name: string };

	beforeEach(async () => {
		actor = await createTestActor();
		scales = await createCollection(actor, { name: 'Умные весы' });
	});

	const historyOf = async (entity: string) =>
		(await listHistory(actor, { entity, actor: null, group: null, subject: null })).events.map(
			(e) => [e.kind, e.data]
		);

	it('creates, renames, lists and deletes collections; names are unique', async () => {
		await createCollection(actor, { name: 'Поход' });
		await expect(createCollection(actor, { name: ' умные ВЕСЫ ' })).rejects.toThrow('уже есть');
		await updateCollection(actor, scales.id, { name: 'Весы', description: 'Проект на ESP32' });
		expect((await listCollections(actor)).map((c) => [c.name, c.description])).toEqual([
			['Весы', 'Проект на ESP32'],
			['Поход', null]
		]);
		expect(await listCollections(await createTestActor('other'))).toEqual([]);
		await expect(getCollectionCard(await createTestActor('third'), scales.id)).rejects.toThrow(
			'не найдена'
		);

		const esp = await createType(actor, { name: 'ESP32' });
		await addEntry(actor, scales.id, { typeId: esp.id, quantity: 2 });
		await deleteCollection(actor, scales.id);
		expect((await listCollections(actor)).map((c) => c.name)).toEqual(['Поход']);
		// The type stays.
		expect(await db.itemType.count({ where: { id: esp.id } })).toBe(1);
		expect((await historyOf(scales.id)).map(([kind]) => kind)).toEqual([
			'collection.deleted',
			'collection.entry',
			'collection.updated',
			'collection.created'
		]);
	});

	it('holds types and items with quantities and says what is short', async () => {
		const esp = await createType(actor, { name: 'ESP32' });
		const scaleType = await createType(actor, { name: 'Весы кухонные' });
		const box = await createType(actor, { name: 'Коробка', isContainer: true });
		const shelf = await createItem(actor, { typeId: box.id, name: 'Полка' });
		await createItem(actor, { typeId: esp.id, quantity: 2, parentId: shelf.id });
		await createItem(actor, { typeId: esp.id, quantity: 3 });
		const scale = await createItem(actor, { typeId: scaleType.id, parentId: shelf.id });

		await addEntry(actor, scales.id, { itemId: scale.id });
		await addEntry(actor, scales.id, { typeId: esp.id, quantity: 4 });
		// A thing nobody has yet: the type is created by name.
		await addEntry(actor, scales.id, { typeName: 'Плата весов', quantity: 2 });
		// Adding again adds to the quantity.
		await addEntry(actor, scales.id, { typeId: esp.id, quantity: 2 });

		const card = await getCollectionCard(actor, scales.id);
		expect(
			card.entries.map((e) => [e.kind, e.name, e.quantity, e.stock.kind, e.stock.have])
		).toEqual([
			['item', 'Весы кухонные', 1, 'item', 1],
			['type', 'ESP32', 6, 'type', 5],
			['type', 'Плата весов', 2, 'type', 0]
		]);
		const [scaleLine, espLine, boardLine] = card.entries.map((e) => e);
		if (!scaleLine || !espLine || !boardLine) throw new Error('three lines expected');
		expect(scaleLine.stock.kind === 'item' && scaleLine.stock.path.map((p) => p.name)).toEqual([
			'Полка'
		]);
		expect(await listCollections(actor)).toMatchObject([
			{ name: 'Умные весы', entryCount: 3, missing: 3 }
		]);

		await updateEntry(actor, scales.id, espLine.id, { quantity: 5 });
		await removeEntry(actor, scales.id, boardLine.id);
		expect((await listCollections(actor))[0]).toMatchObject({ entryCount: 2, missing: 0 });
		await expect(updateEntry(actor, scales.id, boardLine.id, { quantity: 1 })).rejects.toThrow(
			'нет'
		);

		expect(await collectionsOf(actor, { itemId: scale.id })).toEqual([
			{ id: scales.id, name: 'Умные весы', entryId: scaleLine.id, quantity: 1 }
		]);
		expect(await collectionsOf(actor, { typeId: scaleType.id })).toEqual([]);
		expect(await historyOf(esp.id)).toEqual(
			expect.arrayContaining([
				[
					'collection.entry',
					{
						target: { id: esp.id, name: 'ESP32', kind: 'type' },
						change: 'quantity',
						quantity: 5,
						before: 6
					}
				],
				[
					'collection.entry',
					{ target: { id: esp.id, name: 'ESP32', kind: 'type' }, change: 'added', quantity: 4 }
				]
			])
		);
	});

	it('refuses workbenches, other people’s things and bad quantities', async () => {
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		await expect(addEntry(actor, scales.id, { itemId: bench.id })).rejects.toThrow('Рабочий стол');
		const other = await createTestActor('other');
		const theirs = await createType(other, { name: 'Чужое' });
		await expect(addEntry(actor, scales.id, { typeId: theirs.id })).rejects.toThrow('не найден');
		await expect(addEntry(other, scales.id, { typeName: 'x' })).rejects.toThrow('не найдена');
		await expect(addEntry(actor, scales.id, { typeName: 'x', quantity: 0 })).rejects.toThrow(
			'не меньше 1'
		);
		await expect(addEntry(actor, scales.id, {})).rejects.toThrow('Укажите тип или вещь');
	});

	it('keeps lines through moves and archiving, and blocks deleting what is listed', async () => {
		const resistor = await createType(actor, { name: 'Резистор' });
		const box = await createType(actor, { name: 'Коробка', isContainer: true });
		const drawer = await createItem(actor, { typeId: box.id, name: 'Ящик' });
		const loose = await createItem(actor, { typeId: resistor.id, quantity: 5 });
		const kept = await createItem(actor, { typeId: resistor.id, quantity: 5, parentId: drawer.id });
		await addEntry(actor, scales.id, { itemId: loose.id, quantity: 5 });

		// An identical record lies in the drawer, but a record in a collection is not dissolved into it.
		await moveItem(actor, loose.id, drawer.id);
		expect(await db.item.findUnique({ where: { id: loose.id } })).not.toBeNull();
		expect((await db.item.findUnique({ where: { id: kept.id } }))?.quantity).toBe(5);

		await discard(actor, loose.id);
		const [line] = (await getCollectionCard(actor, scales.id)).entries;
		expect(line?.stock).toMatchObject({ kind: 'item', archived: true });
		await expect(purge(actor, loose.id)).rejects.toThrow('в коллекции «Умные весы»');

		const planned = await createType(actor, { name: 'Плата' });
		await addEntry(actor, scales.id, { typeId: planned.id });
		await expect(deleteType(actor, planned.id)).rejects.toThrow(
			'Нельзя удалить тип: он есть в коллекции «Умные весы»'
		);

		await deleteCollection(actor, scales.id);
		await purge(actor, loose.id);
		await deleteType(actor, planned.id);
	});
});
