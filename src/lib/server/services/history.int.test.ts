import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { describeEvent, type HistoryFilters } from '$lib/domain/history';
import { discard, purge, restore } from './archive';
import { describeEntity, HISTORY_PAGE_SIZE, listHistory, listHistoryActors } from './history';
import { createItem, moveItem, updateItem } from './items';
import { addParam, createParamDef, deleteParamDef, updateParam } from './params';
import { bindSticker, unbindSticker } from './stickers';
import { createType, deleteType, updateType } from './types';
import { consume, createWorkbench, returnHome, take } from './workbench';

const all: HistoryFilters = { entity: null, actor: null, group: null, subject: null };

describe('history', () => {
	let actor: Actor;
	let boxType: string;
	let screwType: string;

	const kinds = async (filters: Partial<HistoryFilters> = {}) =>
		(await listHistory(actor, { ...all, ...filters })).events.map((e) => e.kind);

	beforeEach(async () => {
		actor = await createTestActor();
		boxType = (await createType(actor, { name: 'Коробка', isContainer: true })).id;
		screwType = (await createType(actor, { name: 'Винт' })).id;
	});

	it('records the life of an item, newest first, with places by name', async () => {
		const shelf = await createItem(actor, { typeId: boxType, name: 'Полка' });
		const box = await createItem(actor, { typeId: boxType, name: 'Ящик', parentId: shelf.id });
		const screws = await createItem(actor, { typeId: screwType, quantity: 10, parentId: box.id });
		const bench = await createWorkbench(actor, { name: 'Гараж' });

		const part = await take(actor, screws.id, { workbenchId: bench.id, quantity: 4 });
		await returnHome(actor, part.itemId);
		await moveItem(actor, screws.id, shelf.id);
		await updateItem(actor, screws.id, { quantity: 12 });
		await consume(actor, screws.id, 2);

		const events = (await listHistory(actor, { ...all, entity: screws.id })).events;
		expect(events.map((e) => e.kind)).toEqual([
			'item.consumed',
			'item.updated',
			'item.moved',
			'item.returned',
			'item.taken',
			'item.created'
		]);
		const text = events.map((e) => describeEvent(e));
		expect(text[2]!.details[0]!.map((s) => s.text).join('')).toBe('Ящик → Полка');
		expect(text[4]!.title.map((s) => s.text).join('')).toBe('Вещь Винт взята на стол (4 из 10)');
		expect(text[4]!.details[0]!.map((s) => s.text).join('')).toBe('Ящик → Рабочий стол Гараж');
		expect(events.every((e) => e.actor?.id === actor.userId)).toBe(true);
		// The split-off part merged back and is gone: no link to it.
		expect(events[4]!.live).not.toContain(part.itemId);
		expect(events[4]!.live).toContain(screws.id);
	});

	it('finds the events of a container: things put in and taken out', async () => {
		const box = await createItem(actor, { typeId: boxType, name: 'Ящик' });
		const other = await createItem(actor, { typeId: boxType, name: 'Другой' });
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка', parentId: box.id });
		await moveItem(actor, nut.id, other.id);
		await createItem(actor, { typeId: screwType, name: 'Шайба' });

		const events = (await listHistory(actor, { ...all, entity: box.id })).events;
		expect(events.map((e) => [e.kind, e.subjectName])).toEqual([
			['item.moved', 'Гайка'],
			['item.created', 'Гайка'],
			['item.created', 'Ящик']
		]);
		expect(await describeEntity(actor, box.id)).toEqual({ name: 'Ящик', kind: 'item' });
	});

	it('filters by group, subject and actor', async () => {
		const box = await createItem(actor, { typeId: boxType, name: 'Ящик' });
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка' });
		await moveItem(actor, nut.id, box.id);
		await discard(actor, nut.id);

		expect(await kinds({ group: 'moves' })).toEqual(['item.moved']);
		expect(await kinds({ group: 'archive' })).toEqual(['item.discarded']);
		expect(await kinds({ subject: 'type' })).toEqual(['type.created', 'type.created']);
		expect(await kinds({ actor: 'nobody' })).toEqual([]);
		expect(await listHistoryActors(actor)).toEqual([{ id: actor.userId, name: 'tester' }]);
	});

	it('records archive operations with the contents archived together', async () => {
		const box = await createItem(actor, { typeId: boxType, name: 'Ящик' });
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка', parentId: box.id });
		await discard(actor, box.id, { contents: 'discard' });
		await restore(actor, box.id);
		await discard(actor, box.id, { contents: 'discard' });
		await purge(actor, box.id);

		const events = (await listHistory(actor, { ...all, entity: nut.id })).events;
		expect(events.map((e) => e.kind)).toEqual([
			'item.purged',
			'item.discarded',
			'item.restored',
			'item.discarded',
			'item.created'
		]);
		expect(events[1]!.data).toMatchObject({ together: 1 });
		// Purged items keep their history but lose their links.
		expect(events[0]!.live).toEqual([]);
		expect(await describeEntity(actor, box.id)).toEqual({ name: 'Ящик', kind: 'item' });
	});

	it('records that consuming everything archived the item, as one event', async () => {
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка', quantity: 5 });
		await consume(actor, nut.id, 2, { thrownAway: true });
		await consume(actor, nut.id, 3);
		const events = (await listHistory(actor, { ...all, entity: nut.id })).events;
		expect(events.map((e) => e.kind)).toEqual(['item.discarded', 'item.consumed', 'item.created']);
		expect(events[0]!.data).toMatchObject({ consumed: true, quantity: 3 });
		expect(
			describeEvent(events[1]!)
				.title.map((s) => s.text)
				.join('')
		).toBe('Вещь Гайка выкинута: 2 штуки');
	});

	it('records changes of types, parameters and stickers', async () => {
		await updateType(actor, screwType, { name: 'Винт М3', isContainer: false });
		const length = await createParamDef(actor, { name: 'Длина', valueType: 'NUMBER', unit: 'мм' });
		const value = await addParam(
			actor,
			{ typeId: screwType },
			{ defId: length.id, valueType: 'NUMBER', value: 10 }
		);
		await updateParam(actor, value.id, { defId: length.id, valueType: 'NUMBER', value: 10 });
		await updateParam(actor, value.id, { defId: length.id, valueType: 'NUMBER', value: 12 });

		const typeEvents = (await listHistory(actor, { ...all, entity: screwType })).events;
		expect(typeEvents.map((e) => e.kind)).toEqual([
			'params.changed',
			'params.changed',
			'type.updated',
			'type.created'
		]);
		expect(typeEvents[2]!.data).toEqual({
			changes: [{ field: 'name', before: 'Винт', after: 'Винт М3' }]
		});
		expect(typeEvents[0]!.data).toEqual({ changes: [{ name: 'Длина', change: 'changed' }] });
		// A parameter's history includes its values.
		expect(await kinds({ entity: length.id })).toEqual([
			'params.changed',
			'params.changed',
			'paramDef.created'
		]);

		const batch = await db.stickerBatch.create({ data: { ownerId: actor.userId } });
		await db.sticker.create({ data: { ownerId: actor.userId, code: 'K7M4QX', batchId: batch.id } });
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка', quantity: 2 });
		const bound = await bindSticker(actor, 'K7M-4QX', nut.id);
		await unbindSticker(actor, bound.itemId);
		expect(await kinds({ group: 'stickers' })).toEqual(['sticker.unbound', 'sticker.bound']);
		// The stickered one was split off: its events are found by its own id too.
		expect(await kinds({ entity: bound.itemId })).toEqual(['sticker.unbound', 'sticker.bound']);
	});

	it('keeps the history of deleted types and parameters', async () => {
		const color = await createParamDef(actor, { name: 'Цвет', valueType: 'STRING' });
		await deleteParamDef(actor, color.id);
		await deleteType(actor, screwType);
		const events = (await listHistory(actor, all)).events;
		expect(events.slice(0, 2).map((e) => [e.kind, e.subjectName, e.live])).toEqual([
			['type.deleted', 'Винт', []],
			['paramDef.deleted', 'Цвет', []]
		]);
		expect(await describeEntity(actor, color.id)).toEqual({ name: 'Цвет', kind: 'paramDef' });
	});

	it('writes nothing when a change is rejected or changes nothing', async () => {
		const nut = await createItem(actor, { typeId: screwType, name: 'Гайка' });
		await expect(moveItem(actor, nut.id, null)).rejects.toThrow();
		await updateItem(actor, nut.id, { name: 'Гайка' });
		expect(await kinds({ entity: nut.id })).toEqual(['item.created']);
	});

	it('shows only what the actor may see', async () => {
		const other = await createTestActor('other');
		await createType(other, { name: 'Чужой' });
		expect(await kinds()).toEqual(['type.created', 'type.created']);
		expect(await describeEntity(actor, 'missing')).toEqual({ name: 'неизвестно что', kind: null });
	});

	it('pages through long histories with a cursor', async () => {
		for (let i = 0; i < HISTORY_PAGE_SIZE; i++) {
			await createType(actor, { name: `Тип ${i}` });
		}
		const first = await listHistory(actor, all);
		expect(first.events).toHaveLength(HISTORY_PAGE_SIZE);
		expect(first.nextCursor).not.toBeNull();
		const second = await listHistory(actor, all, first.nextCursor);
		expect(second.events.map((e) => e.subjectName)).toEqual(['Винт', 'Коробка']);
		expect(second.nextCursor).toBeNull();
	});
});
