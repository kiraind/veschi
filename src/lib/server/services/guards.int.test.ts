import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { discard } from './archive';
import { listHistory } from './history';
import { createItem } from './items';
import { addParam } from './params';
import { bindSticker } from './stickers';
import { consume, createWorkbench, deleteWorkbench, relocate } from './workbench';
import type { HistoryFilters } from '$lib/domain/history';

const only = (f: Partial<HistoryFilters>): HistoryFilters => ({
	entity: null,
	actor: null,
	group: null,
	subject: null,
	...f
});

/** Rules the services enforce on their own, whatever the interface offers. */
describe('service guards', () => {
	let actor: Actor;
	let typeId: string;
	let boxTypeId: string;

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Винт' } })).id;
		boxTypeId = (
			await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Коробка', isContainer: true }
			})
		).id;
	});

	const box = async (parentId: string | null = null) =>
		(await createItem(actor, { typeId: boxTypeId, parentId })).id;
	const screws = async (quantity: number, parentId: string | null = null) =>
		(await createItem(actor, { typeId, quantity, parentId })).id;
	const refDef = async () =>
		(
			await db.paramDef.create({
				data: { ownerId: actor.userId, name: 'Запчасть для', valueType: 'REF' }
			})
		).id;

	it('does not use up a container with things inside', async () => {
		const outer = await box();
		await screws(3, outer);
		await expect(consume(actor, outer, 1)).rejects.toThrow('В контейнере есть вещи');
	});

	it('records «Выкинуть всё» through consume as thrown away, not used', async () => {
		const id = await screws(4);
		await consume(actor, id, 4, { thrownAway: true });
		const [event] = (await listHistory(actor, only({}))).events;
		expect(event?.kind).toBe('item.discarded');
		expect(event?.data).not.toHaveProperty('consumed');
	});

	it('records where the contents of a discarded container went', async () => {
		const shelf = await box();
		const inner = await box(shelf);
		const id = await screws(3, inner);
		await discard(actor, inner);
		const forScrews = await listHistory(actor, only({ entity: id }));
		expect(forScrews.events.map((e) => e.kind)).toContain('item.discarded');
		expect(forScrews.events.find((e) => e.kind === 'item.discarded')?.data).toMatchObject({
			moved: 1,
			movedTo: { id: shelf }
		});
	});

	it('refuses to «put elsewhere» into the place the item already lies in', async () => {
		const shelf = await box();
		const id = await screws(3, shelf);
		await expect(relocate(actor, id, shelf)).rejects.toThrow('уже лежит здесь');
	});

	it('binds no sticker to a workbench; deleting a bench writes its old sticker off', async () => {
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		await db.sticker.create({ data: { ownerId: actor.userId, code: 'K7M4QX' } });
		await expect(bindSticker(actor, 'K7M4QX', bench.id)).rejects.toThrow('не найдена');
		await db.sticker.update({
			where: { code: 'K7M4QX' },
			data: { status: 'BOUND', itemId: bench.id }
		});
		await deleteWorkbench(actor, bench.id);
		expect(await db.sticker.findUniqueOrThrow({ where: { code: 'K7M4QX' } })).toMatchObject({
			status: 'WRITTEN_OFF',
			itemId: null
		});
	});

	it('changes no parameters of a workbench or of an archived item', async () => {
		const defId = (
			await db.paramDef.create({
				data: { ownerId: actor.userId, name: 'Цвет', valueType: 'STRING' }
			})
		).id;
		const value = { defId, valueType: 'STRING', text: 'синий' };
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		await expect(addParam(actor, { itemId: bench.id }, value)).rejects.toThrow('рабочего стола');
		const id = await screws(1);
		await discard(actor, id);
		await expect(addParam(actor, { itemId: id }, value)).rejects.toThrow('в архиве');
	});

	it('lets a parameter «Вещь» point at neither itself nor an archived item', async () => {
		const defId = await refDef();
		const id = await screws(1);
		const old = await screws(1);
		await discard(actor, old);
		await expect(
			addParam(actor, { itemId: id }, { defId, valueType: 'REF', refItemId: id })
		).rejects.toThrow('саму себя');
		await expect(
			addParam(actor, { itemId: id }, { defId, valueType: 'REF', refItemId: old })
		).rejects.toThrow('в архиве');
	});

	it('shows an item created with a parameter in that parameter’s history', async () => {
		const defId = (
			await db.paramDef.create({
				data: { ownerId: actor.userId, name: 'Цвет', valueType: 'STRING' }
			})
		).id;
		await createItem(actor, {
			typeId,
			params: [{ defId, valueType: 'STRING', text: 'синий' }]
		});
		const events = (await listHistory(actor, only({ entity: defId }))).events;
		expect(events.map((e) => e.kind)).toEqual(['item.created']);
	});
});
