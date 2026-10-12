import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { linkDef } from '$lib/server/testing/params';
import type { ParamDefView } from '$lib/domain/params';
import { createCategory, setCategoryParams } from './categories';
import { createItem } from './items';
import {
	addParam,
	createParamDef,
	deleteParam,
	deleteParamDef,
	getParamDef,
	listParamDefs,
	listParams,
	setParams,
	updateParam,
	updateParamDef
} from './params';
import { createWorkbench, take } from './workbench';

describe('links', () => {
	let actor: Actor;
	let contains: ParamDefView;
	let partOf: ParamDefView;

	beforeEach(async () => {
		actor = await createTestActor();
		contains = await linkDef(actor, 'Содержит деталь', 'ITEM', 'ITEM', 'Является деталью');
		partOf = (await listParamDefs(actor)).find((d) => d.name === 'Является деталью')!;
	});

	const item = async (name: string, quantity = 1) =>
		(await createItem(actor, { newTypeName: name, quantity })).id;

	/** What an item's or a type's links point at, by parameter name. */
	async function links(target: { itemId: string } | { typeId: string }) {
		return Object.fromEntries(
			(await listParams(actor, target)).map((p) => [p.key, p.refs?.map((r) => r.name)])
		);
	}

	it('creates a link together with its inverse', async () => {
		expect(contains).toMatchObject({
			valueType: 'ITEM',
			holder: 'ITEM',
			inverse: { id: partOf.id, name: 'Является деталью' }
		});
		expect(partOf).toMatchObject({
			valueType: 'ITEM',
			holder: 'ITEM',
			inverse: { id: contains.id, name: 'Содержит деталь' }
		});
	});

	it('makes a symmetric link one parameter', async () => {
		const fits = await createParamDef(actor, {
			name: 'Совместим с',
			valueType: 'TYPE',
			holder: 'TYPE',
			inverseName: 'совместим с'
		});
		expect(fits.inverse).toEqual({ id: fits.id, name: 'Совместим с' });
		const a = await db.itemType.create({ data: { ownerId: actor.userId, name: 'A' } });
		const b = await db.itemType.create({ data: { ownerId: actor.userId, name: 'B' } });
		await addParam(actor, { typeId: a.id }, { defId: fits.id, valueType: 'TYPE', refIds: [b.id] });
		expect(await links({ typeId: b.id })).toEqual({ 'Совместим с': ['A'] });
	});

	it('mirrors added, changed and removed values on the other side', async () => {
		const radio = await item('Радио');
		const tv = await item('Телевизор');
		const [lamp, knob, cap] = [await item('Лампа'), await item('Ручка'), await item('Конденсатор')];

		const value = await addParam(
			actor,
			{ itemId: radio },
			{ defId: contains.id, valueType: 'ITEM', refIds: [lamp, knob] }
		);
		expect(value.refs?.map((r) => r.name)).toEqual(['Лампа', 'Ручка']);
		expect(await links({ itemId: lamp })).toEqual({ 'Является деталью': ['Радио'] });
		expect(await links({ itemId: knob })).toEqual({ 'Является деталью': ['Радио'] });

		// The other side can be edited too.
		const lampValue = (await listParams(actor, { itemId: lamp }))[0]!;
		await updateParam(actor, lampValue.id, {
			defId: partOf.id,
			valueType: 'ITEM',
			refIds: [radio, tv]
		});
		expect(await links({ itemId: tv })).toEqual({ 'Содержит деталь': ['Лампа'] });

		await updateParam(actor, value.id, {
			defId: contains.id,
			valueType: 'ITEM',
			refIds: [lamp, cap]
		});
		// The knob is no longer a part: its inverse value had no other target and is gone.
		expect(await links({ itemId: knob })).toEqual({});
		expect(await links({ itemId: cap })).toEqual({ 'Является деталью': ['Радио'] });
		expect(await links({ itemId: lamp })).toEqual({ 'Является деталью': ['Радио', 'Телевизор'] });

		await deleteParam(actor, value.id);
		expect(await links({ itemId: lamp })).toEqual({ 'Является деталью': ['Телевизор'] });
		expect(await links({ itemId: cap })).toEqual({});

		// The change on the other side is in its history.
		const events = await db.historyEvent.findMany({
			where: { kind: 'params.changed', subjectId: cap },
			orderBy: { createdAt: 'asc' }
		});
		expect(events.map((e) => e.data)).toEqual([
			{ changes: [{ name: 'Является деталью', change: 'added' }] },
			{ changes: [{ name: 'Является деталью', change: 'removed' }] }
		]);
	});

	it('mirrors a whole list replaced at once', async () => {
		const radio = await item('Радио');
		const lamp = await item('Лампа');
		await setParams(actor, { itemId: radio }, [
			{ defId: contains.id, valueType: 'ITEM', refIds: [lamp] }
		]);
		expect(await links({ itemId: lamp })).toEqual({ 'Является деталью': ['Радио'] });
		await setParams(actor, { itemId: radio }, []);
		expect(await links({ itemId: lamp })).toEqual({});
	});

	it('links items with types both ways', async () => {
		const fitsType = await linkDef(actor, 'Подходит к', 'TYPE', 'ITEM', 'Подходящие вещи');
		const charger = await item('Зарядка');
		const laptop = await db.itemType.create({ data: { ownerId: actor.userId, name: 'Ноутбук' } });
		await addParam(
			actor,
			{ itemId: charger },
			{ defId: fitsType.id, valueType: 'TYPE', refIds: [laptop.id] }
		);
		expect(await links({ typeId: laptop.id })).toEqual({ 'Подходящие вещи': ['Зарядка'] });
		const inverse = (await getParamDef(actor, fitsType.inverse!.id)).def;
		expect(inverse).toMatchObject({ valueType: 'ITEM', holder: 'TYPE', typeCount: 1 });

		// A link lives on one kind of holder only.
		await expect(
			addParam(
				actor,
				{ typeId: laptop.id },
				{ defId: fitsType.id, valueType: 'TYPE', refIds: [laptop.id] }
			)
		).rejects.toThrow('задаётся только у вещей');
	});

	it('gives a part split off a record the same links', async () => {
		const radio = await item('Радио');
		const screws = await item('Винт', 10);
		await addParam(
			actor,
			{ itemId: screws },
			{ defId: partOf.id, valueType: 'ITEM', refIds: [radio] }
		);
		const bench = await createWorkbench(actor, { name: 'Стол' });
		const { itemId: part } = await take(actor, screws, { workbenchId: bench.id, quantity: 3 });
		expect(part).not.toBe(screws);
		expect(await links({ itemId: part })).toEqual({ 'Является деталью': ['Радио'] });
		expect(await links({ itemId: radio })).toEqual({ 'Содержит деталь': ['Винт', 'Винт'] });
	});

	it('renames the inverse and keeps the kind of link', async () => {
		const input = {
			name: 'Содержит',
			valueType: 'ITEM',
			holder: 'ITEM',
			inverseName: 'Входит в'
		} as const;
		const renamed = await updateParamDef(actor, contains.id, input);
		expect(renamed.inverse).toEqual({ id: partOf.id, name: 'Входит в' });
		await expect(updateParamDef(actor, contains.id, { ...input, holder: 'TYPE' })).rejects.toThrow(
			'задаётся при создании'
		);
		await expect(
			updateParamDef(actor, contains.id, { ...input, valueType: 'STRING' })
		).rejects.toThrow('задаётся при создании');
		await expect(
			updateParamDef(actor, contains.id, { ...input, inverseName: 'содержит' })
		).rejects.toThrow('не может совпадать');
		const weight = await createParamDef(actor, { name: 'Вес', valueType: 'NUMBER' });
		await expect(updateParamDef(actor, weight.id, { ...input, name: 'Вес' })).rejects.toThrow(
			'только новый параметр'
		);
	});

	it('refuses a name the inverse would share', async () => {
		await expect(linkDef(actor, 'Деталь от', 'ITEM', 'ITEM', 'Является деталью')).rejects.toThrow(
			'уже есть'
		);
		expect((await listParamDefs(actor)).map((d) => d.name)).not.toContain('Деталь от');
	});

	it('deletes a link with its inverse once neither has values', async () => {
		const radio = await item('Радио');
		const lamp = await item('Лампа');
		const value = await addParam(
			actor,
			{ itemId: radio },
			{ defId: contains.id, valueType: 'ITEM', refIds: [lamp] }
		);
		await expect(deleteParamDef(actor, partOf.id)).rejects.toThrow('сначала удалите значения');
		await deleteParam(actor, value.id);
		await deleteParamDef(actor, partOf.id);
		expect(await listParamDefs(actor)).toEqual([]);
	});

	it('is required by a category only where it lives', async () => {
		const category = await createCategory(actor, { name: 'Электроника' });
		await expect(
			setCategoryParams(actor, category.id, [{ defId: partOf.id, level: 'TYPE' }])
		).rejects.toThrow('только у каждой вещи');
		await setCategoryParams(actor, category.id, [{ defId: partOf.id, level: 'ITEM' }]);
	});
});
