import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { formatPath } from '$lib/domain/item';
import { createDictionary } from './dictionaries';
import { createItem } from './items';
import { setParams } from './params';
import { search } from './search';

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
		return (await createItem(actor, { isContainer: true, ...input })).id;
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
		await setParams(actor, { typeId: ne555Type }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const lm = await item({ newTypeName: 'LM358', parentId: solderingBox });
		await setParams(actor, { itemId: lm }, [{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }]);
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
		await setParams(actor, { typeId: ne555Type }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const smd = await item({ typeId: ne555Type, parentId: solderingBox });
		await setParams(actor, { itemId: smd }, [{ key: 'Корпус', valueType: 'STRING', text: 'SO-8' }]);
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
		const dictionary = await createDictionary(actor, {
			name: 'Состояние',
			options: [{ label: 'новое' }, { label: 'б/у' }]
		});
		await setParams(actor, { itemId: solderingBox }, [
			{ key: 'питание', valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{
				key: 'состояние',
				valueType: 'ENUM',
				dictionaryId: dictionary.id,
				optionIds: [dictionary.options[1]!.id]
			},
			{ key: 'рядом', valueType: 'REF', refItemId: chipBox }
		]);
		for (const q of ['4,5', '4.5', 'б/у', 'состояние: б/у', 'микросхемами']) {
			const found = (await search(actor, q)).flatMap((g) => g.locations.map((l) => l.itemId));
			expect(found, q).toContain(solderingBox);
		}
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
