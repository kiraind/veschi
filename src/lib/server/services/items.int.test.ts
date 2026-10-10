import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { discard, restore } from './archive';
import { createItem, getItemCard, listContents, moveItem, updateItem } from './items';
import { keyed, setKeyedParams } from '$lib/server/testing/params';
import { search } from './search';
import { updateType } from './types';
import { createWorkbench, relocate, take } from './workbench';

describe('items', () => {
	let actor: Actor;
	/** A container type. */
	let boxType: string;
	/** A type of plain things. */
	let thingType: string;

	async function box(name: string, parentId: string | null = null) {
		return (await createItem(actor, { typeId: boxType, name, parentId })).id;
	}

	beforeEach(async () => {
		actor = await createTestActor();
		boxType = (
			await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Коробка', isContainer: true }
			})
		).id;
		thingType = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Вещь' } })).id;
	});

	describe('createItem', () => {
		it('creates an item with a new type, quantity and parent', async () => {
			const shelf = await box('Полка');
			const { id } = await createItem(actor, {
				newTypeName: 'NE555',
				quantity: 10,
				parentId: shelf
			});
			const card = await getItemCard(actor, id);
			expect(card.item.displayName).toBe('NE555');
			expect(card.item.quantity).toBe(10);
			expect(card.path.map((n) => n.name)).toEqual(['Полка']);
		});

		it('reuses an existing type with the same name, case-insensitively', async () => {
			const a = await createItem(actor, { newTypeName: 'коробка' });
			expect((await db.item.findUniqueOrThrow({ where: { id: a.id } })).typeId).toBe(boxType);
		});

		it('binds a free sticker in the same transaction', async () => {
			await db.sticker.create({
				data: { code: 'K7M4QX', ownerId: actor.userId, caption: 'Припой' }
			});
			const { id } = await createItem(actor, { typeId: boxType, stickerCode: 'k7m-4qx' });
			const sticker = await db.sticker.findUniqueOrThrow({ where: { code: 'K7M4QX' } });
			expect(sticker).toMatchObject({ status: 'BOUND', itemId: id });
		});

		it('rolls back when the sticker cannot be bound', async () => {
			await expect(
				createItem(actor, { newTypeName: 'Новый тип', stickerCode: 'K7M4QX' })
			).rejects.toThrow('Такой наклейки нет');
			expect(await db.item.count()).toBe(0);
			expect(await db.itemType.count({ where: { name: 'Новый тип' } })).toBe(0);
		});

		it('saves own parameters', async () => {
			const { id } = await createItem(actor, {
				typeId: boxType,
				params: await keyed(actor, [{ key: 'серийный номер', valueType: 'STRING', text: 'SN-1' }])
			});
			expect((await getItemCard(actor, id)).itemParams).toMatchObject([
				{ key: 'серийный номер', text: 'SN-1' }
			]);
		});

		it('rejects quantity below 1, missing type, workbench or foreign parents', async () => {
			await expect(createItem(actor, { typeId: boxType, quantity: 0 })).rejects.toThrow();
			await expect(createItem(actor, { name: 'Без типа' })).rejects.toThrow();
			const bench = await db.item.create({
				data: { ownerId: actor.userId, name: 'Гараж', isWorkbench: true }
			});
			await expect(createItem(actor, { typeId: boxType, parentId: bench.id })).rejects.toThrow(
				'На стол'
			);
			const other = await createTestActor('other');
			const foreign = await db.item.create({ data: { ownerId: other.userId, typeId: boxType } });
			await expect(createItem(actor, { typeId: boxType, parentId: foreign.id })).rejects.toThrow(
				'Контейнер не найден'
			);
		});
	});

	describe('display name', () => {
		it('shows the type name without an own name and the own name otherwise', async () => {
			const plain = await createItem(actor, { typeId: boxType, name: '  ' });
			const named = await box('Коробка с микросхемами');
			expect((await getItemCard(actor, plain.id)).item.displayName).toBe('Коробка');
			expect((await getItemCard(actor, named)).item.displayName).toBe('Коробка с микросхемами');
		});
	});

	describe('updateItem', () => {
		it('changes name, quantity and type', async () => {
			const { id } = await createItem(actor, { typeId: boxType, name: 'Старое' });
			await updateItem(actor, id, { name: '', quantity: 3, newTypeName: 'Ящик' });
			const card = await getItemCard(actor, id);
			expect(card.item).toMatchObject({ name: null, displayName: 'Ящик', quantity: 3 });
		});

		it('rejects quantity 0', async () => {
			const id = await box('Коробка');
			await expect(updateItem(actor, id, { quantity: 0 })).rejects.toThrow();
		});

		it('no longer accepts a container mark on the item', async () => {
			const { id } = await createItem(actor, { typeId: thingType, quantity: 3 });
			await updateItem(actor, id, { isContainer: true });
			expect((await getItemCard(actor, id)).item).toMatchObject({
				isContainer: false,
				quantity: 3
			});
		});

		it('changes to a container type only with quantity 1', async () => {
			const { id } = await createItem(actor, { typeId: thingType, quantity: 5 });
			await expect(updateItem(actor, id, { typeId: boxType })).rejects.toThrow('а их сейчас 5 шт.');
			await expect(updateItem(actor, id, { typeId: boxType, quantity: 2 })).rejects.toThrow(
				'У контейнера количество всегда 1'
			);
			expect(await db.item.findUniqueOrThrow({ where: { id } })).toMatchObject({
				typeId: thingType,
				quantity: 5
			});
			await updateItem(actor, id, { typeId: boxType, quantity: 1 });
			const card = await getItemCard(actor, id);
			expect(card.item).toMatchObject({ isContainer: true, quantity: 1 });
			expect(card.type).toMatchObject({ id: boxType, isContainer: true });
		});

		it('changes from a container type to another only while empty', async () => {
			const shelf = await box('Полка');
			const inside = (await createItem(actor, { typeId: thingType, parentId: shelf })).id;
			await expect(updateItem(actor, shelf, { typeId: thingType })).rejects.toThrow(
				'Внутри лежат вещи'
			);
			await expect(updateItem(actor, shelf, { newTypeName: 'Полка' })).rejects.toThrow(
				'Внутри лежат вещи'
			);
			expect(await db.itemType.count({ where: { name: 'Полка' } })).toBe(0);

			const otherBoxType = await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Ящик', isContainer: true }
			});
			await updateItem(actor, shelf, { typeId: otherBoxType.id });
			expect((await getItemCard(actor, shelf)).children.map((c) => c.id)).toEqual([inside]);

			await moveItem(actor, inside, null);
			await updateItem(actor, shelf, { typeId: thingType, quantity: 4 });
			expect((await getItemCard(actor, shelf)).item).toMatchObject({
				isContainer: false,
				quantity: 4
			});
		});

		it('changes from a container type only when nothing taken from it is on a bench', async () => {
			const shelf = await box('Полка');
			const knife = (await createItem(actor, { typeId: thingType, parentId: shelf })).id;
			const bench = await createWorkbench(actor, { name: 'Гараж' });
			await take(actor, knife, { workbenchId: bench.id });
			await expect(updateItem(actor, shelf, { typeId: thingType })).rejects.toThrow(
				'на рабочем столе'
			);
			await relocate(actor, knife, null);
			await updateItem(actor, shelf, { typeId: thingType });
		});
	});

	describe('moveItem', () => {
		it('rejects putting a box into itself or its contents and changes nothing', async () => {
			const outer = await box('Внешняя');
			const inner = await box('Внутренняя', outer);
			await expect(moveItem(actor, outer, outer)).rejects.toThrow('в саму себя');
			await expect(moveItem(actor, outer, inner)).rejects.toThrow('в саму себя');
			expect((await db.item.findUniqueOrThrow({ where: { id: outer } })).parentId).toBeNull();
		});

		it('gives all contents a new path in search after moving the box', async () => {
			const cabinet = await box('Шкаф');
			const shelf1 = await box('Полка 1', cabinet);
			const shelf2 = await box('Полка 2', cabinet);
			const chips = await box('Коробка с микросхемами', shelf1);
			await createItem(actor, { newTypeName: 'NE555', quantity: 10, parentId: chips });

			await moveItem(actor, chips, shelf2);
			const group = (await search(actor, 'NE555'))[0]!;
			expect(group.locations[0]!.path.map((n) => n.name)).toEqual([
				'Шкаф',
				'Полка 2',
				'Коробка с микросхемами'
			]);
		});

		it('moves to the top level', async () => {
			const outer = await box('Шкаф');
			const inner = await box('Коробка', outer);
			await moveItem(actor, inner, null);
			expect((await db.item.findUniqueOrThrow({ where: { id: inner } })).parentId).toBeNull();
		});

		it('rejects workbenches as target or subject and archived items', async () => {
			const bench = await db.item.create({
				data: { ownerId: actor.userId, name: 'Гараж', isWorkbench: true }
			});
			const item = await box('Коробка');
			await expect(moveItem(actor, item, bench.id)).rejects.toThrow('На стол');
			await expect(moveItem(actor, bench.id, item)).rejects.toThrow('Рабочий стол');
			const archived = await box('Старая');
			await db.item.update({ where: { id: archived }, data: { status: 'ARCHIVED' } });
			await expect(moveItem(actor, item, archived)).rejects.toThrow('в архиве');
			await expect(moveItem(actor, archived, item)).rejects.toThrow('в архиве');
		});

		it('takes an item off the workbench and forgets its home', async () => {
			const bench = await db.item.create({
				data: { ownerId: actor.userId, name: 'Гараж', isWorkbench: true }
			});
			const home = await box('Ящик');
			const target = await box('Другой ящик');
			const knife = await db.item.create({
				data: {
					ownerId: actor.userId,
					typeId: thingType,
					parentId: bench.id,
					homeId: home,
					splitFromId: home,
					takenById: actor.userId,
					takenAt: new Date()
				}
			});
			await moveItem(actor, knife.id, target);
			expect(await db.item.findUniqueOrThrow({ where: { id: knife.id } })).toMatchObject({
				parentId: target,
				homeId: null,
				takenById: null,
				takenAt: null,
				splitFromId: null
			});
		});
	});

	describe('container contents', () => {
		it('lists direct active children with quantity and child counts', async () => {
			const chips = await box('Коробка с микросхемами');
			const bag = await box('Пакет', chips);
			await createItem(actor, { newTypeName: 'NE555', quantity: 10, parentId: chips });
			await createItem(actor, { newTypeName: 'LM317', quantity: 3, parentId: bag });
			const gone = await createItem(actor, { newTypeName: 'Сгоревший', parentId: chips });
			await db.item.update({ where: { id: gone.id }, data: { status: 'ARCHIVED' } });

			const card = await getItemCard(actor, chips);
			expect(card.children.map((c) => [c.name, c.quantity, c.childCount])).toEqual([
				['Пакет', 1, 1],
				['NE555', 10, 0]
			]);
			const nested = await listContents(actor, bag);
			expect(nested.map((c) => [c.name, c.quantity])).toEqual([['LM317', 3]]);
		});

		it('lists top-level items without workbenches', async () => {
			await box('Шкаф');
			await db.item.create({ data: { ownerId: actor.userId, name: 'Гараж', isWorkbench: true } });
			expect((await listContents(actor, null)).map((c) => c.name)).toEqual(['Шкаф']);
		});
	});

	describe('item card', () => {
		it('shows type parameters on every item of the type with the unit of the parameter', async () => {
			const knifeType = await db.itemType.create({ data: { ownerId: actor.userId, name: 'Нож' } });
			const a = await createItem(actor, { typeId: knifeType.id, name: 'Нож в шкафу' });
			const b = await createItem(actor, { typeId: knifeType.id, name: 'Нож в гараже' });
			await setKeyedParams(actor, { typeId: knifeType.id }, [
				{ key: 'длина лезвия', valueType: 'NUMBER', value: 85, unit: 'мм' }
			]);
			for (const id of [a.id, b.id]) {
				const card = await getItemCard(actor, id);
				expect(card.typeParams).toMatchObject([{ key: 'длина лезвия', value: 85, unit: 'мм' }]);
				expect(card.itemParams).toEqual([]);
			}
		});

		it('lists own values apart and leaves out the type values they override', async () => {
			const { id } = await createItem(actor, { typeId: thingType });
			await setKeyedParams(actor, { typeId: thingType }, [
				{ key: 'Цвет', valueType: 'STRING', text: 'красный' },
				{ key: 'Вес', valueType: 'NUMBER', value: 10, unit: 'г' }
			]);
			await setKeyedParams(actor, { itemId: id }, [
				{ key: 'серийный номер', valueType: 'STRING', text: 'SN-1' },
				{ key: 'цвет', valueType: 'STRING', text: 'синий' }
			]);
			const card = await getItemCard(actor, id);
			expect(card.itemParams.map((p) => [p.key, 'text' in p ? p.text : null])).toEqual([
				['серийный номер', 'SN-1'],
				['Цвет', 'синий']
			]);
			expect(card.typeParams).toMatchObject([{ key: 'Вес', value: 10, unit: 'г' }]);
			expect(card).not.toHaveProperty('params');

			const plain = await createItem(actor, { typeId: thingType });
			expect((await getItemCard(actor, plain.id)).typeParams.map((p) => p.key)).toEqual([
				'Цвет',
				'Вес'
			]);
		});

		it('shows the type description and container mark', async () => {
			await updateType(actor, boxType, { name: 'Коробка', description: 'Картонная, 30×20' });
			const card = await getItemCard(actor, await box('Коробка 1'));
			expect(card.type).toMatchObject({
				id: boxType,
				name: 'Коробка',
				description: 'Картонная, 30×20',
				isContainer: true
			});
			expect(card.item.isContainer).toBe(true);
		});

		it('marks REF targets in the archive', async () => {
			const charger = await createItem(actor, { newTypeName: 'Блок питания 12 В' });
			const { id } = await createItem(actor, { newTypeName: 'Паяльник' });
			await setKeyedParams(actor, { itemId: id }, [
				{ key: 'зарядка', valueType: 'REF', refItemId: charger.id }
			]);
			await db.item.update({ where: { id: charger.id }, data: { status: 'ARCHIVED' } });
			expect((await getItemCard(actor, id)).itemParams[0]!.ref).toEqual({
				kind: 'item',
				id: charger.id,
				name: 'Блок питания 12 В',
				archived: true
			});
		});

		it('includes the sticker and is hidden from other users', async () => {
			const id = await box('Коробка');
			await db.sticker.create({
				data: { code: 'K7M4QX', ownerId: actor.userId, status: 'BOUND', itemId: id }
			});
			expect((await getItemCard(actor, id)).sticker).toMatchObject({
				code: 'K7M4QX',
				status: 'BOUND'
			});
			const other = await createTestActor('other');
			await expect(getItemCard(other, id)).rejects.toThrow('Вещь не найдена');
		});
	});

	describe('containers', () => {
		it('puts things only into items of a container type', async () => {
			const plain = (await createItem(actor, { typeId: thingType, name: 'Нож' })).id;
			const spoon = (await createItem(actor, { typeId: thingType, name: 'Ложка' })).id;
			await expect(createItem(actor, { typeId: thingType, parentId: plain })).rejects.toThrow(
				'«Нож» — не контейнер'
			);
			await expect(moveItem(actor, spoon, plain)).rejects.toThrow('не контейнер');

			await updateItem(actor, plain, { typeId: boxType });
			await moveItem(actor, spoon, plain);
			expect((await db.item.findUniqueOrThrow({ where: { id: spoon } })).parentId).toBe(plain);
		});

		it('puts things into every item once its type becomes a container', async () => {
			const a = (await createItem(actor, { typeId: thingType, name: 'Пакет А' })).id;
			const b = (await createItem(actor, { typeId: thingType, name: 'Пакет Б' })).id;
			await updateType(actor, thingType, { name: 'Пакет', isContainer: true });
			await createItem(actor, { newTypeName: 'NE555', quantity: 3, parentId: a });
			await createItem(actor, { newTypeName: 'LM317', quantity: 3, parentId: b });
			expect((await getItemCard(actor, a)).children.map((c) => c.name)).toEqual(['NE555']);
		});

		it('restores an item to the top level when its place is no longer a container', async () => {
			const shelf = await box('Полка');
			const inside = (await createItem(actor, { typeId: thingType, parentId: shelf })).id;
			await discard(actor, inside, {});
			await updateItem(actor, shelf, { typeId: thingType });
			await restore(actor, inside);
			expect((await db.item.findUniqueOrThrow({ where: { id: inside } })).parentId).toBeNull();
		});

		it('shows the type photo in the contents', async () => {
			await db.itemType.update({ where: { id: boxType }, data: { photoKey: 'types/x.webp' } });
			await box('Коробка');
			expect((await listContents(actor, null))[0]?.photoKey).toBe('types/x.webp');
		});

		it('lists containers before other things', async () => {
			await createItem(actor, { typeId: thingType, name: 'А-вещь' });
			await box('Я-коробка');
			const names = (await listContents(actor, null)).map((e) => [e.name, e.isContainer]);
			expect(names).toEqual([
				['Я-коробка', true],
				['А-вещь', false]
			]);
		});
	});

	describe('container quantity', () => {
		it('is always 1 when creating an item of a container type', async () => {
			await expect(createItem(actor, { typeId: boxType, quantity: 2 })).rejects.toThrow(
				'У контейнера количество всегда 1'
			);
			expect((await createItem(actor, { typeId: thingType, quantity: 2 })).id).toBeTruthy();
		});

		it('ignores a container mark on the item itself', async () => {
			const { id } = await createItem(actor, { typeId: thingType, isContainer: true, quantity: 2 });
			expect((await getItemCard(actor, id)).item).toMatchObject({
				isContainer: false,
				quantity: 2
			});
		});

		it('cannot be changed for a container', async () => {
			const shelf = await box('Полка');
			await expect(updateItem(actor, shelf, { quantity: 3 })).rejects.toThrow(
				'У контейнера количество всегда 1'
			);
			await updateItem(actor, shelf, { quantity: 1, name: 'Полка 2' });
			expect((await db.item.findUniqueOrThrow({ where: { id: shelf } })).quantity).toBe(1);
		});
	});

	describe('new container types', () => {
		it('creates a container type with the first item', async () => {
			const { id } = await createItem(actor, {
				newTypeName: 'Органайзер',
				newTypeIsContainer: true,
				name: 'Органайзер с резисторами'
			});
			const card = await getItemCard(actor, id);
			expect(card.type).toMatchObject({ name: 'Органайзер', isContainer: true });
			expect(card.item.isContainer).toBe(true);
			await createItem(actor, { newTypeName: 'Резистор 10 кОм', quantity: 100, parentId: id });
			expect((await getItemCard(actor, id)).children.map((c) => c.quantity)).toEqual([100]);
		});

		it('needs quantity 1 and creates nothing otherwise', async () => {
			await expect(
				createItem(actor, { newTypeName: 'Органайзер', newTypeIsContainer: true, quantity: 2 })
			).rejects.toThrow('У контейнера количество всегда 1');
			expect(await db.itemType.count({ where: { name: 'Органайзер' } })).toBe(0);
			expect(await db.item.count()).toBe(0);
		});

		it('creates a plain type without the mark', async () => {
			const { id } = await createItem(actor, { newTypeName: 'Органайзер', quantity: 2 });
			expect((await getItemCard(actor, id)).type?.isContainer).toBe(false);
		});

		it('keeps the mark of an existing type with the same name', async () => {
			const { id } = await createItem(actor, {
				newTypeName: 'вещь',
				newTypeIsContainer: true,
				quantity: 3
			});
			expect((await db.item.findUniqueOrThrow({ where: { id } })).typeId).toBe(thingType);
			expect((await db.itemType.findUniqueOrThrow({ where: { id: thingType } })).isContainer).toBe(
				false
			);
			await expect(
				createItem(actor, { newTypeName: 'КОРОБКА', newTypeIsContainer: false, quantity: 3 })
			).rejects.toThrow('У контейнера количество всегда 1');
		});
	});

	describe('moving part of the quantity', () => {
		let shelf: string;
		let drawer: string;
		let chips: string;

		beforeEach(async () => {
			shelf = await box('Полка');
			drawer = await box('Ящик');
			chips = (await createItem(actor, { newTypeName: 'NE555', quantity: 10, parentId: shelf })).id;
			await db.sticker.create({
				data: { code: 'K7M4QX', ownerId: actor.userId, status: 'BOUND', itemId: chips }
			});
		});

		it('moves 3 of 10: the source keeps 7 and the sticker, the part is a new record', async () => {
			const { itemId } = await moveItem(actor, chips, drawer, { quantity: 3 });
			expect(itemId).not.toBe(chips);
			const source = await db.item.findUniqueOrThrow({
				where: { id: chips },
				include: { sticker: true }
			});
			expect(source).toMatchObject({ quantity: 7, parentId: shelf });
			expect(source.sticker?.code).toBe('K7M4QX');
			const part = await db.item.findUniqueOrThrow({
				where: { id: itemId },
				include: { sticker: true }
			});
			expect(part).toMatchObject({
				quantity: 3,
				parentId: drawer,
				typeId: source.typeId,
				ownerId: actor.userId,
				splitFromId: null,
				takenById: null
			});
			expect(part.sticker).toBeNull();
		});

		it('moves the record itself when the whole quantity is asked', async () => {
			expect(await moveItem(actor, chips, drawer, { quantity: 10 })).toEqual({ itemId: chips });
			expect(await moveItem(actor, chips, null)).toEqual({ itemId: chips });
			expect((await db.item.findUniqueOrThrow({ where: { id: chips } })).parentId).toBeNull();
		});

		it('rejects moving into the container the item already lies in', async () => {
			await expect(moveItem(actor, chips, shelf)).rejects.toThrow('Вещь уже лежит здесь');
			await expect(moveItem(actor, chips, shelf, { quantity: 3 })).rejects.toThrow(
				'Вещь уже лежит здесь'
			);
			await expect(moveItem(actor, shelf, null)).rejects.toThrow('Вещь уже лежит здесь');
			expect(await db.item.count({ where: { parentId: shelf } })).toBe(1);
			expect((await db.item.findUniqueOrThrow({ where: { id: chips } })).quantity).toBe(10);
		});

		it('gives a moved part copies of the own parameter values', async () => {
			await setKeyedParams(actor, { itemId: chips }, [
				{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' },
				{ key: 'партия', valueType: 'NUMBER', value: 7 }
			]);
			const { itemId } = await moveItem(actor, chips, drawer, { quantity: 3 });
			const part = await getItemCard(actor, itemId);
			expect(part.itemParams).toMatchObject([
				{ key: 'корпус', text: 'DIP-8' },
				{ key: 'партия', value: 7 }
			]);
			expect((await getItemCard(actor, chips)).itemParams).toHaveLength(2);
			// The copies are separate values: changing one leaves the other.
			await setKeyedParams(actor, { itemId }, []);
			expect((await getItemCard(actor, chips)).itemParams).toHaveLength(2);
		});

		it('adds a part to an identical record already in the target', async () => {
			const first = await moveItem(actor, chips, drawer, { quantity: 3 });
			const second = await moveItem(actor, chips, drawer, { quantity: 2 });
			expect(second).toEqual(first);
			expect(await db.item.findUniqueOrThrow({ where: { id: first.itemId } })).toMatchObject({
				quantity: 5,
				parentId: drawer
			});
			expect((await db.item.findUniqueOrThrow({ where: { id: chips } })).quantity).toBe(5);
			expect((await listContents(actor, drawer)).map((c) => [c.name, c.quantity])).toEqual([
				['NE555', 5]
			]);
		});

		it('adds a whole plain record to an identical one and deletes it', async () => {
			const { itemId: inDrawer } = await moveItem(actor, chips, drawer, { quantity: 3 });
			const typeId = (await db.item.findUniqueOrThrow({ where: { id: chips } })).typeId;
			const loose = (await createItem(actor, { typeId, quantity: 4, parentId: shelf })).id;
			expect(await moveItem(actor, loose, drawer)).toEqual({ itemId: inDrawer });
			expect(await db.item.findUnique({ where: { id: loose } })).toBeNull();
			expect((await db.item.findUniqueOrThrow({ where: { id: inDrawer } })).quantity).toBe(7);
			// Found once, with the total.
			const group = (await search(actor, 'NE555'))[0]!;
			expect(group.total).toBe(14);
			expect(group.locations.map((l) => l.quantity).sort()).toEqual([7, 7]);
		});

		it('keeps records with a sticker apart', async () => {
			const { itemId: inDrawer } = await moveItem(actor, chips, drawer, { quantity: 3 });
			// The stickered source moves as itself and stays its own record.
			expect(await moveItem(actor, chips, drawer)).toEqual({ itemId: chips });
			expect(await db.item.count({ where: { parentId: drawer } })).toBe(2);
			// A plain record does not merge into the stickered one either.
			const typeId = (await db.item.findUniqueOrThrow({ where: { id: chips } })).typeId;
			await db.item.delete({ where: { id: inDrawer } });
			const loose = (await createItem(actor, { typeId, quantity: 4, parentId: shelf })).id;
			expect(await moveItem(actor, loose, drawer)).toEqual({ itemId: loose });
			expect((await db.item.findUniqueOrThrow({ where: { id: chips } })).quantity).toBe(7);
		});

		it('keeps records with different own values, names or references apart', async () => {
			const { itemId: plainPart } = await moveItem(actor, chips, drawer, { quantity: 3 });
			await setKeyedParams(actor, { itemId: chips }, [
				{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
			]);
			const { itemId: dipPart } = await moveItem(actor, chips, drawer, { quantity: 2 });
			expect(dipPart).not.toBe(plainPart);
			// Same values again → merges into the part with them.
			expect(await moveItem(actor, chips, drawer, { quantity: 1 })).toEqual({ itemId: dipPart });
			expect((await db.item.findUniqueOrThrow({ where: { id: dipPart } })).quantity).toBe(3);

			await setKeyedParams(actor, { itemId: chips }, []);
			await updateItem(actor, chips, { name: 'NE555 старые' });
			const { itemId: named } = await moveItem(actor, chips, drawer, { quantity: 1 });
			expect([plainPart, dipPart]).not.toContain(named);

			// A record something refers to keeps its identity.
			const referenced = (
				await createItem(actor, {
					typeId: (await db.item.findUniqueOrThrow({ where: { id: chips } })).typeId,
					quantity: 2,
					parentId: shelf
				})
			).id;
			const { id: user } = await createItem(actor, { newTypeName: 'Плата' });
			await setKeyedParams(actor, { itemId: user }, [
				{ key: 'микросхема', valueType: 'REF', refItemId: referenced }
			]);
			expect(await moveItem(actor, referenced, drawer)).toEqual({ itemId: referenced });
			expect((await db.item.findUniqueOrThrow({ where: { id: plainPart } })).quantity).toBe(3);
		});

		it('does not merge items of a container type', async () => {
			const a = await box('Пакет');
			const b = await box('Пакет');
			await moveItem(actor, a, drawer);
			expect(await moveItem(actor, b, drawer)).toEqual({ itemId: b });
			expect(await db.item.count({ where: { parentId: drawer } })).toBe(2);
		});

		it('rejects parts out of range', async () => {
			await expect(moveItem(actor, chips, drawer, { quantity: 11 })).rejects.toThrow(
				'не больше 10'
			);
			await expect(moveItem(actor, chips, drawer, { quantity: 0 })).rejects.toThrow();
			expect((await db.item.findUniqueOrThrow({ where: { id: chips } })).quantity).toBe(10);
		});

		it('moving part off a bench leaves the rest there, still taken', async () => {
			const bench = await createWorkbench(actor, { name: 'Гараж' });
			const { itemId: onBench } = await take(actor, chips, { workbenchId: bench.id, quantity: 4 });
			const { itemId } = await moveItem(actor, onBench, drawer, { quantity: 1 });
			expect(await db.item.findUniqueOrThrow({ where: { id: onBench } })).toMatchObject({
				quantity: 3,
				parentId: bench.id,
				homeId: shelf,
				splitFromId: chips,
				takenById: actor.userId
			});
			expect(await db.item.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
				quantity: 1,
				parentId: drawer,
				homeId: null,
				splitFromId: null,
				takenById: null
			});
		});
	});
});
