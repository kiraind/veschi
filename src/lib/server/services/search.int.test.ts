import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { formatPath } from '$lib/domain/item';
import { createItem, moveItem } from './items';
import { enumDef, optionId, setKeyedParams } from '$lib/server/testing/params';
import { updateParamDef } from './params';
import { search } from './search';
import { updateType } from './types';

/**
 * The spec example: NE555 — 10 in «Шкаф → Полка 2 → Коробка с микросхемами»
 * and 2 in «Ящик с паяльником».
 */
describe('search', () => {
	let actor: Actor;
	let ne555Type: string;
	let chipBox: string;
	let solderingBox: string;

	async function item(input: Record<string, unknown>) {
		return (await createItem(actor, { newTypeIsContainer: !('quantity' in input), ...input })).id;
	}

	beforeEach(async () => {
		actor = await createTestActor();
		const cabinet = await item({ newTypeName: 'Шкаф' });
		const shelf = await item({ newTypeName: 'Полка', name: 'Полка 2', parentId: cabinet });
		chipBox = await item({
			newTypeName: 'Коробка IKEA Kuggis',
			name: 'Коробка с микросхемами',
			parentId: shelf
		});
		solderingBox = await item({ newTypeName: 'Ящик', name: 'Ящик с паяльником' });
		await item({ newTypeName: 'NE555', quantity: 10, parentId: chipBox });
		ne555Type = (await db.itemType.findFirstOrThrow({ where: { name: 'NE555' } })).id;
		await item({ typeId: ne555Type, quantity: 2, parentId: solderingBox });
	});

	it('finds «ne555» as one type with the total and every location with its path', async () => {
		const results = await search(actor, 'ne555');
		expect(results).toHaveLength(1);
		const group = results[0]!;
		expect(group).toMatchObject({ typeId: ne555Type, typeName: 'NE555', total: 12 });
		expect(group.locations.map((l) => [formatPath(l.path), l.quantity])).toEqual([
			['Шкаф → Полка 2 → Коробка с микросхемами', 10],
			['Ящик с паяльником', 2]
		]);
	});

	it('finds «DIP-8» in a type parameter or an item parameter', async () => {
		await setKeyedParams(actor, { typeId: ne555Type }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const lm = await item({ newTypeName: 'LM358', parentId: solderingBox });
		await setKeyedParams(actor, { itemId: lm }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		await item({ newTypeName: 'LM317', parentId: solderingBox });

		const names = (await search(actor, 'DIP-8')).map((g) => g.typeName);
		expect(names.sort()).toEqual(['LM358', 'NE555']);
		expect((await search(actor, 'корпус: dip-8')).map((g) => g.typeName).sort()).toEqual([
			'LM358',
			'NE555'
		]);
		expect(await search(actor, 'цвет: dip-8')).toEqual([]);
	});

	it('does not match a type value overridden by the item', async () => {
		await setKeyedParams(actor, { typeId: ne555Type }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const smd = await item({ typeId: ne555Type, parentId: solderingBox });
		await setKeyedParams(actor, { itemId: smd }, [
			{ key: 'Корпус', valueType: 'STRING', text: 'SO-8' }
		]);
		const group = (await search(actor, 'DIP-8'))[0]!;
		expect(group.locations.map((l) => l.itemId)).not.toContain(smd);
		expect((await search(actor, 'SO-8'))[0]!.locations.map((l) => l.itemId)).toEqual([smd]);
	});

	it('finds an item by its own name', async () => {
		const results = await search(actor, 'Коробка с микросхемами');
		expect(results).toHaveLength(1);
		expect(results[0]!.locations).toMatchObject([
			{ itemId: chipBox, name: 'Коробка с микросхемами' }
		]);
	});

	it('matches numbers, enum labels and ref names', async () => {
		const condition = await enumDef(actor, 'Состояние', ['новое', 'б/у']);
		await setKeyedParams(actor, { itemId: solderingBox }, [
			{ key: 'питание', valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{ key: 'состояние', valueType: 'ENUM', optionIds: [optionId(condition, 'б/у')] },
			{ key: 'рядом', valueType: 'REF', refItemId: chipBox }
		]);
		for (const q of ['4,5', '4.5', 'б/у', 'состояние: б/у', 'микросхемами']) {
			const found = (await search(actor, q)).flatMap((g) => g.locations.map((l) => l.itemId));
			expect(found, q).toContain(solderingBox);
		}
	});

	it('matches the unit of the parameter, as it is now', async () => {
		await setKeyedParams(actor, { typeId: ne555Type }, [
			{ key: 'шаг выводов', valueType: 'NUMBER', value: 2.54, unit: 'мм' }
		]);
		await setKeyedParams(actor, { itemId: solderingBox }, [
			{ key: 'обозначение', valueType: 'STRING', text: 'X' }
		]);
		const found = async (q: string) => (await search(actor, q)).map((g) => g.typeName);
		expect(await found('2,54 мм')).toEqual(['NE555']);
		expect(await found('шаг выводов: мм')).toEqual(['NE555']);

		const def = await db.paramDef.findFirstOrThrow({ where: { name: 'шаг выводов' } });
		await updateParamDef(actor, def.id, { name: 'шаг выводов', valueType: 'NUMBER', unit: 'дюйм' });
		expect(await found('2,54 мм')).toEqual([]);
		expect(await found('2,54 дюйм')).toEqual(['NE555']);
	});

	it('finds items by the description of their type', async () => {
		await updateType(actor, ne555Type, { name: 'NE555', description: 'Прецизионный таймер' });
		const results = await search(actor, 'прецизионный');
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ typeId: ne555Type, total: 12 });
		await updateType(actor, ne555Type, { name: 'NE555', description: null });
		expect(await search(actor, 'прецизионный')).toEqual([]);
	});

	it('marks locations of a container type as containers', async () => {
		const box = (await search(actor, 'Коробка с микросхемами'))[0]!.locations[0]!;
		expect(box.isContainer).toBe(true);
		const chips = (await search(actor, 'NE555'))[0]!.locations[0]!;
		expect(chips.isContainer).toBe(false);
	});

	it('shows one location after a part is moved onto an identical record', async () => {
		const chips = (await search(actor, 'NE555'))[0]!.locations[0]!.itemId;
		await moveItem(actor, chips, solderingBox, { quantity: 4 });
		const group = (await search(actor, 'NE555'))[0]!;
		expect(group.total).toBe(12);
		expect(group.locations.map((l) => [formatPath(l.path), l.quantity])).toEqual([
			['Шкаф → Полка 2 → Коробка с микросхемами', 6],
			['Ящик с паяльником', 6]
		]);
	});

	it('does not find archived items, workbenches or other users’ items', async () => {
		const other = await createTestActor('other');
		await createItem(other, { newTypeName: 'NE555', quantity: 100 });
		const archived = await item({ typeId: ne555Type, quantity: 5 });
		await db.item.update({ where: { id: archived }, data: { status: 'ARCHIVED' } });
		await db.item.create({
			data: { ownerId: actor.userId, name: 'NE555 стол', isWorkbench: true }
		});

		const results = await search(actor, 'NE555');
		expect(results).toHaveLength(1);
		expect(results[0]!.total).toBe(12);
	});

	it('finds an item on a workbench with the path «Рабочий стол Гараж»', async () => {
		const bench = await db.item.create({
			data: { ownerId: actor.userId, name: 'Гараж', isWorkbench: true }
		});
		const knife = await item({ newTypeName: 'Нож Victorinox' });
		await db.item.update({
			where: { id: knife },
			data: { parentId: bench.id, takenById: actor.userId, takenAt: new Date() }
		});
		const group = (await search(actor, 'victorinox'))[0]!;
		expect(formatPath(group.locations[0]!.path)).toBe('Рабочий стол Гараж');
	});

	it('treats LIKE wildcards literally', async () => {
		expect(await search(actor, '%')).toEqual([]);
		expect(await search(actor, '   ')).toEqual([]);
	});
});
