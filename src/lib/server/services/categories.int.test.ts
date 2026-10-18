import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { defIdFor, keyed, setKeyedParams } from '$lib/server/testing/params';
import {
	addTypeToCategory,
	categoryNotices,
	createCategory,
	deleteCategory,
	getCategoryCard,
	listCategories,
	removeTypeFromCategory,
	setCategoryParams,
	updateCategory
} from './categories';
import { discard } from './archive';
import { listHistory } from './history';
import { createItem, getItemCard } from './items';
import { addParam, deleteParam, deleteParamDef, listParams, setParams } from './params';
import { search } from './search';
import { createType, getTypeCard } from './types';

describe('categories', () => {
	let actor: Actor;
	let calories: string;
	let expiry: string;
	let food: { id: string; name: string };

	beforeEach(async () => {
		actor = await createTestActor();
		calories = await defIdFor(actor, 'Калорийность', 'NUMBER', 'ккал');
		expiry = await defIdFor(actor, 'Срок годности', 'DATE');
		food = await createCategory(actor, { name: 'Еда' });
		await setCategoryParams(actor, food.id, [
			{ defId: calories, level: 'TYPE' },
			{ defId: expiry, level: 'ITEM' }
		]);
	});

	const historyKinds = async (entity: string) =>
		(await listHistory(actor, { entity, actor: null, group: null, subject: null })).events.map(
			(e) => e.kind
		);

	it('creates, renames and lists categories; names are unique', async () => {
		await createCategory(actor, { name: 'Хрупкое' });
		await expect(createCategory(actor, { name: ' еда ' })).rejects.toThrow('уже есть');
		await updateCategory(actor, food.id, { name: 'Продукты', description: 'Всё съедобное' });

		expect(
			(await listCategories(actor)).map((c) => [c.name, c.params.map((p) => p.level)])
		).toEqual([
			['Продукты', ['TYPE', 'ITEM']],
			['Хрупкое', []]
		]);
		expect(await listCategories(await createTestActor('other'))).toEqual([]);
		expect(await historyKinds(food.id)).toEqual([
			'category.updated',
			'category.params',
			'category.created'
		]);
	});

	it('shows unfilled «у типа» values on the type and keeps filled ones', async () => {
		const buckwheat = await createType(actor, { name: 'Гречка' });
		await addTypeToCategory(actor, buckwheat.id, food.id);
		await addTypeToCategory(actor, buckwheat.id, food.id); // twice is fine

		let card = await getTypeCard(actor, buckwheat.id);
		expect(card.categories).toEqual([food]);
		expect(card.missing.map((m) => m.def.name)).toEqual(['Калорийность']);
		expect(card.itemRequired.map((m) => m.def.name)).toEqual(['Срок годности']);

		const [value] = await keyed(actor, [
			{ key: 'Калорийность', valueType: 'NUMBER', value: 313, unit: 'ккал' }
		]);
		const param = await addParam(actor, { typeId: buckwheat.id }, value);
		card = await getTypeCard(actor, buckwheat.id);
		expect(card.missing).toEqual([]);

		// A required value can be changed but not removed — in any way.
		await expect(deleteParam(actor, param.id)).rejects.toThrow(
			'«Калорийность» нельзя удалить: он обязателен в категории «Еда»'
		);
		await expect(setParams(actor, { typeId: buckwheat.id }, [])).rejects.toThrow('нельзя удалить');

		await removeTypeFromCategory(actor, buckwheat.id, food.id);
		await deleteParam(actor, param.id);
		expect(await listParams(actor, { typeId: buckwheat.id })).toEqual([]);
		expect(await historyKinds(buckwheat.id)).toEqual([
			'params.changed',
			'type.category',
			'params.changed',
			'type.category',
			'type.created'
		]);
	});

	it('requires «у каждой вещи» values on new items and lists items without them', async () => {
		const milk = await createType(actor, { name: 'Молоко' });
		const old = await createItem(actor, { typeId: milk.id });
		await addTypeToCategory(actor, milk.id, food.id);

		await expect(createItem(actor, { typeId: milk.id })).rejects.toThrow(
			'Заполните параметр «Срок годности»: он обязателен у каждой вещи в категории «Еда»'
		);
		const fresh = await createItem(actor, {
			typeId: milk.id,
			params: await keyed(actor, [{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' }])
		});

		const oldCard = await getItemCard(actor, old.id);
		expect(oldCard.categories).toEqual([food]);
		expect(oldCard.missingItemParams.map((m) => m.def.name)).toEqual(['Срок годности']);
		expect(oldCard.missingTypeParams.map((m) => m.def.name)).toEqual(['Калорийность']);
		expect((await getItemCard(actor, fresh.id)).missingItemParams).toEqual([]);

		const card = await getCategoryCard(actor, food.id);
		expect(card.types).toEqual([
			{ id: milk.id, name: 'Молоко', total: 2, missing: ['Калорийность'] }
		]);
		expect(card.incompleteItems).toEqual([
			{ id: old.id, name: 'Молоко', missing: ['Срок годности'] }
		]);
		expect(card.incompleteItemCount).toBe(1);

		// The item's own date is required; its own other values are not.
		await setKeyedParams(actor, { itemId: fresh.id }, [
			{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-21' },
			{ key: 'Жирность', valueType: 'NUMBER', value: 3.2 }
		]);
		await setKeyedParams(actor, { itemId: fresh.id }, [
			{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-21' }
		]);
		await expect(setParams(actor, { itemId: fresh.id }, [])).rejects.toThrow('нельзя удалить');
		// A gap left from before does not block other changes.
		await setKeyedParams(actor, { itemId: old.id }, [
			{ key: 'Жирность', valueType: 'NUMBER', value: 1.5 }
		]);
	});

	it('warns about unfilled values and categories without parameters', async () => {
		const empty = await createCategory(actor, { name: 'Хрупкое' });
		expect(await categoryNotices(actor)).toEqual({ incomplete: [], empty: [empty] });

		const milk = await createType(actor, { name: 'Молоко' });
		const old = await createItem(actor, { typeId: milk.id });
		const older = await createItem(actor, { typeId: milk.id });
		await addTypeToCategory(actor, milk.id, food.id);
		await createItem(actor, {
			typeId: milk.id,
			params: await keyed(actor, [{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' }])
		});
		expect((await categoryNotices(actor)).incomplete).toEqual([
			{ ...food, typeCount: 1, itemCount: 2 }
		]);

		// Archived items do not count; a filled type and items clear the notice.
		await discard(actor, older.id);
		await addParam(
			actor,
			{ typeId: milk.id },
			(
				await keyed(actor, [{ key: 'Калорийность', valueType: 'NUMBER', value: 60, unit: 'ккал' }])
			)[0]
		);
		expect((await categoryNotices(actor)).incomplete).toEqual([
			{ ...food, typeCount: 0, itemCount: 1 }
		]);
		await setKeyedParams(actor, { itemId: old.id }, [
			{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-21' }
		]);
		expect(await categoryNotices(actor)).toEqual({ incomplete: [], empty: [empty] });
		expect(await categoryNotices(await createTestActor('other'))).toEqual({
			incomplete: [],
			empty: []
		});
	});

	it('counts unfilled items per category, each by its own parameters', async () => {
		const color = await defIdFor(actor, 'Цвет', 'STRING');
		const paint = await createCategory(actor, { name: 'Краска' });
		await setCategoryParams(actor, paint.id, [{ defId: color, level: 'ITEM' }]);
		const milk = await createType(actor, { name: 'Молоко' });
		await addParam(
			actor,
			{ typeId: milk.id },
			(
				await keyed(actor, [{ key: 'Калорийность', valueType: 'NUMBER', value: 60, unit: 'ккал' }])
			)[0]
		);
		const withValues = (values: Parameters<typeof keyed>[1]) =>
			keyed(actor, values).then((params) => createItem(actor, { typeId: milk.id, params }));
		await withValues([{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' }]);
		await withValues([{ key: 'Цвет', valueType: 'STRING', text: 'белый' }]);
		await withValues([{ key: 'Цвет', valueType: 'STRING', text: 'жёлтый' }]);
		await withValues([
			{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' },
			{ key: 'Цвет', valueType: 'STRING', text: 'белый' }
		]);
		await addTypeToCategory(actor, milk.id, food.id);
		await addTypeToCategory(actor, milk.id, paint.id);

		expect((await categoryNotices(actor)).incomplete).toEqual([
			{ ...food, typeCount: 0, itemCount: 2 },
			{ ...paint, typeCount: 0, itemCount: 1 }
		]);
	});

	it('puts a new type into categories when an item is created with it', async () => {
		await expect(
			createItem(actor, { newTypeName: 'Кефир', newTypeCategoryIds: [food.id] })
		).rejects.toThrow('Заполните параметр «Срок годности»');
		expect(await db.itemType.count()).toBe(0);

		const { id } = await createItem(actor, {
			newTypeName: 'Кефир',
			newTypeCategoryIds: [food.id],
			params: await keyed(actor, [{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' }])
		});
		const card = await getItemCard(actor, id);
		expect(card.categories).toEqual([food]);
		expect(card.missingTypeParams.map((m) => m.def.name)).toEqual(['Калорийность']);
		expect(await historyKinds(card.type!.id)).toContain('type.category');
	});

	it('creates a new type with its description and parameters together with an item', async () => {
		const { id } = await createItem(actor, {
			newTypeName: 'Молоко',
			newTypeCategoryIds: [food.id],
			newTypeDescription: '  Ультрапастеризованное  ',
			newTypeParams: await keyed(actor, [
				{ key: 'Калорийность', valueType: 'NUMBER', value: 60, unit: 'ккал' }
			]),
			params: await keyed(actor, [{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-25' }])
		});
		const card = await getItemCard(actor, id);
		expect(card.type?.description).toBe('Ультрапастеризованное');
		expect(card.typeParams.map((p) => p.key)).toEqual(['Калорийность']);
		expect(card.itemParams.map((p) => p.key)).toEqual(['Срок годности']);
		expect(card.missingTypeParams).toEqual([]);
		// The type's history shows its creation once, not a separate change of its parameters.
		expect(await historyKinds(card.type!.id)).toEqual([
			'item.created',
			'type.category',
			'type.created'
		]);

		// An existing type of that name is not changed behind the user's back.
		await expect(
			createItem(actor, {
				newTypeName: 'молоко',
				newTypeDescription: 'Другое',
				params: await keyed(actor, [
					{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-25' }
				])
			})
		).rejects.toThrow('Тип «Молоко» уже есть');
		await expect(
			createItem(actor, {
				typeId: card.type!.id,
				newTypeParams: await keyed(actor, [
					{ key: 'Калорийность', valueType: 'NUMBER', value: 1, unit: 'ккал' }
				])
			})
		).rejects.toThrow('меняются на его странице');
	});

	it('merges requirements of several categories', async () => {
		const fragile = await createCategory(actor, { name: 'Хрупкое' });
		const glass = await defIdFor(actor, 'Материал', 'STRING');
		await setCategoryParams(actor, fragile.id, [
			{ defId: glass, level: 'TYPE' },
			{ defId: calories, level: 'TYPE' },
			{ defId: expiry, level: 'TYPE' }
		]);
		const jam = await createType(actor, { name: 'Варенье' });
		await addTypeToCategory(actor, jam.id, food.id);
		await addTypeToCategory(actor, jam.id, fragile.id);
		const card = await getTypeCard(actor, jam.id);
		expect(card.missing.map((m) => [m.def.name, m.categories.map((c) => c.name)])).toEqual([
			['Калорийность', ['Еда', 'Хрупкое']],
			['Материал', ['Хрупкое']],
			['Срок годности', ['Хрупкое']]
		]);
		// Required on the type by one category and on each item by another: both apply.
		expect(card.itemRequired.map((m) => m.def.name)).toEqual(['Срок годности']);
	});

	it('records changes of the required list and protects used parameters', async () => {
		await setCategoryParams(actor, food.id, [
			{ defId: expiry, level: 'TYPE' },
			{ defId: await defIdFor(actor, 'Состав', 'STRING'), level: 'TYPE' }
		]);
		const events = (
			await listHistory(actor, { entity: food.id, actor: null, group: null, subject: null })
		).events;
		expect(events[0]?.data).toEqual({
			changes: [
				{ name: 'Срок годности', change: 'level', level: 'TYPE' },
				{ name: 'Состав', change: 'added', level: 'TYPE' },
				{ name: 'Калорийность', change: 'removed', level: 'TYPE' }
			]
		});
		await expect(deleteParamDef(actor, expiry)).rejects.toThrow('обязателен в категориях: «Еда»');
		await deleteParamDef(actor, calories);
		await expect(
			setCategoryParams(actor, food.id, [{ defId: calories, level: 'TYPE' }])
		).rejects.toThrow('Параметр не найден');
	});

	it('is found by search and leaves types alone when deleted', async () => {
		const milk = await createType(actor, { name: 'Молоко' });
		await addTypeToCategory(actor, milk.id, food.id);
		await createItem(actor, {
			typeId: milk.id,
			params: await keyed(actor, [{ key: 'Срок годности', valueType: 'DATE', date: '2026-10-20' }])
		});
		expect((await search(actor, 'еда')).map((g) => g.typeName)).toEqual(['Молоко']);

		await deleteCategory(actor, food.id);
		expect((await getTypeCard(actor, milk.id)).categories).toEqual([]);
		expect(await historyKinds(food.id)).toEqual([
			'category.deleted',
			'type.category',
			'category.params',
			'category.created'
		]);
		expect(await db.categoryParam.count()).toBe(0);
	});

	it('hides categories of other users', async () => {
		const other = await createTestActor('other');
		const milk = await createType(actor, { name: 'Молоко' });
		await expect(getCategoryCard(other, food.id)).rejects.toThrow('Категория не найдена');
		await expect(addTypeToCategory(other, milk.id, food.id)).rejects.toThrow('Тип не найден');
	});
});
