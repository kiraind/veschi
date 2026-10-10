import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { formatParamValue } from '$lib/domain/params';
import { keyed, setKeyedParams, type KeyedParam } from '$lib/server/testing/params';
import { createDictionary, updateDictionary } from './dictionaries';
import { uploadParamFile } from './files';
import { createItem } from './items';
import {
	addParam,
	createParamDef,
	deleteParam,
	deleteParamDef,
	getParamDef,
	listParamDefs,
	listParams,
	moveParam,
	setParams,
	updateParam,
	updateParamDef
} from './params';

describe('params', () => {
	let actor: Actor;
	let typeId: string;
	let itemId: string;

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Паяльник' } })).id;
		itemId = (await createItem(actor, { typeId })).id;
	});

	async function conditionDictionary(multiple = false) {
		return createDictionary(actor, {
			name: multiple ? 'Интерфейсы' : 'Состояние',
			multiple,
			options: multiple
				? [{ label: 'USB' }, { label: 'Bluetooth' }]
				: [{ label: 'новое' }, { label: 'б/у' }, { label: 'сломано' }]
		});
	}

	it('stores and shows every value type without loss', async () => {
		const dictionary = await conditionDictionary(true);
		const charger = await createItem(actor, { newTypeName: 'Блок питания 12 В' });
		const file = await uploadParamFile(actor, {
			name: 'manual.pdf',
			type: 'application/pdf',
			data: Buffer.from('%PDF-1.4')
		});
		const inputs: KeyedParam[] = [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' },
			{ key: 'длина лезвия', valueType: 'NUMBER', value: 85, unit: 'мм' },
			{ key: 'цена', valueType: 'NUMBER', value: 4500, unit: '₽' },
			{ key: 'питание', valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{
				key: 'интерфейсы',
				valueType: 'ENUM',
				dictionaryId: dictionary.id,
				optionIds: dictionary.options.map((o) => o.id)
			},
			{ key: 'даташит', valueType: 'URL', url: 'https://example.com/ne555.pdf' },
			{ key: 'инструкция', ...file },
			{ key: 'гарантия до', valueType: 'DATE', date: '2027-05-01' },
			{ key: 'зарядка', valueType: 'REF', refItemId: charger.id, refTypeId: null },
			{ key: 'тип зарядки', valueType: 'REF', refItemId: null, refTypeId: typeId },
			{ key: 'работает', valueType: 'BOOLEAN', value: false }
		];
		const saved = await setKeyedParams(actor, { itemId }, inputs);
		expect(saved).toMatchObject(inputs.map(({ dictionaryId: _d, ...p }) => p));
		expect(saved.map(formatParamValue)).toEqual([
			'DIP-8',
			'85 мм',
			'4\u202f500 ₽',
			'4,5–16 В',
			'USB, Bluetooth',
			'https://example.com/ne555.pdf',
			'manual.pdf',
			'2027-05-01',
			'Блок питания 12 В',
			'Паяльник',
			'нет'
		]);
	});

	it('replaces the whole list in order', async () => {
		await setKeyedParams(actor, { typeId }, [
			{ key: 'a', valueType: 'STRING', text: '1' },
			{ key: 'b', valueType: 'STRING', text: '2' }
		]);
		await setKeyedParams(actor, { typeId }, [
			{ key: 'c', valueType: 'BOOLEAN', value: true },
			{ key: 'a', valueType: 'STRING', text: '3' }
		]);
		expect((await listParams(actor, { typeId })).map((p) => p.key)).toEqual(['c', 'a']);
		await setKeyedParams(actor, { typeId }, []);
		expect(await listParams(actor, { typeId })).toEqual([]);
	});

	it('rejects a range with min > max and changes nothing', async () => {
		await setKeyedParams(actor, { itemId }, [{ key: 'a', valueType: 'STRING', text: '1' }]);
		await expect(
			setKeyedParams(actor, { itemId }, [{ key: 'питание', valueType: 'RANGE', min: 16, max: 4.5 }])
		).rejects.toThrow('Минимум больше максимума');
		expect((await listParams(actor, { itemId })).map((p) => p.key)).toEqual(['a']);
	});

	it('rejects two options of a single-choice dictionary and allows them for multiple', async () => {
		const single = await conditionDictionary(false);
		await expect(
			setKeyedParams(actor, { itemId }, [
				{
					key: 'состояние',
					valueType: 'ENUM',
					dictionaryId: single.id,
					optionIds: [single.options[0]!.id, single.options[1]!.id]
				}
			])
		).rejects.toThrow('только один вариант');
		const multiple = await conditionDictionary(true);
		const saved = await setKeyedParams(actor, { itemId }, [
			{
				key: 'интерфейсы 2',
				valueType: 'ENUM',
				dictionaryId: multiple.id,
				optionIds: multiple.options.map((o) => o.id)
			}
		]);
		expect(saved[0]!.options?.map((o) => o.label)).toEqual(['USB', 'Bluetooth']);
	});

	it('shows a renamed option everywhere', async () => {
		const dictionary = await conditionDictionary();
		const used = dictionary.options[1]!;
		const other = (await createItem(actor, { typeId })).id;
		for (const id of [itemId, other]) {
			await setKeyedParams(actor, { itemId: id }, [
				{ key: 'состояние', valueType: 'ENUM', dictionaryId: dictionary.id, optionIds: [used.id] }
			]);
		}
		await updateDictionary(actor, dictionary.id, {
			name: 'Состояние',
			options: dictionary.options.map((o) => (o.id === used.id ? { id: o.id, label: 'Б/У' } : o))
		});
		for (const id of [itemId, other]) {
			expect((await listParams(actor, { itemId: id }))[0]!.options).toEqual([
				{ id: used.id, label: 'Б/У' }
			]);
		}
	});

	it('rejects options of another dictionary, foreign refs and foreign files', async () => {
		const a = await conditionDictionary(false);
		const b = await conditionDictionary(true);
		await expect(
			setKeyedParams(actor, { itemId }, [
				{ key: 'x', valueType: 'ENUM', dictionaryId: a.id, optionIds: [b.options[0]!.id] }
			])
		).rejects.toThrow('нет в списке');

		const other = await createTestActor('other');
		const foreign = await createItem(other, { newTypeName: 'Чужое' });
		await expect(
			setKeyedParams(actor, { itemId }, [{ key: 'x2', valueType: 'REF', refItemId: foreign.id }])
		).rejects.toThrow('не найдены');

		const file = await uploadParamFile(other, {
			name: 'a.txt',
			type: 'text/plain',
			data: Buffer.from('a')
		});
		await expect(setKeyedParams(actor, { itemId }, [{ key: 'x3', ...file }])).rejects.toThrow(
			'файл не найден'
		);
	});

	it('deletes the stored file when its parameter is removed', async () => {
		const file = await uploadParamFile(actor, {
			name: 'a.txt',
			type: 'text/plain',
			data: Buffer.from('a')
		});
		await setKeyedParams(actor, { itemId }, [{ key: 'файл', ...file }]);
		expect(await storage().get(file.fileKey)).not.toBeNull();
		await setKeyedParams(actor, { itemId }, []);
		expect(await storage().get(file.fileKey)).toBeNull();
	});

	it('rejects a parameter twice and other users’ targets', async () => {
		await expect(
			setKeyedParams(actor, { itemId }, [
				{ key: 'Цвет', valueType: 'STRING', text: '1' },
				{ key: 'цвет', valueType: 'STRING', text: '2' }
			])
		).rejects.toThrow();
		const other = await createTestActor('other');
		await expect(setParams(other, { typeId }, [])).rejects.toThrow('Тип не найден');
	});

	it('rejects a value of another type than its parameter', async () => {
		const def = await createParamDef(actor, { name: 'вес', valueType: 'NUMBER' });
		await expect(
			addParam(actor, { itemId }, { defId: def.id, valueType: 'STRING', text: 'много' })
		).rejects.toThrow('Число');
	});

	it('adds, changes, reorders and deletes single values', async () => {
		const weight = await createParamDef(actor, { name: 'Вес', valueType: 'NUMBER' });
		const color = await createParamDef(actor, { name: 'Цвет', valueType: 'STRING' });
		const w = await addParam(
			actor,
			{ typeId },
			{ defId: weight.id, valueType: 'NUMBER', value: 3 }
		);
		const c = await addParam(
			actor,
			{ typeId },
			{ defId: color.id, valueType: 'STRING', text: 'red' }
		);
		expect(w.key).toBe('Вес');
		await expect(
			addParam(actor, { typeId }, { defId: color.id, valueType: 'STRING', text: 'blue' })
		).rejects.toThrow('уже есть');

		const changed = await updateParam(actor, w.id, {
			defId: weight.id,
			valueType: 'NUMBER',
			value: 5,
			unit: 'кг'
		});
		expect(formatParamValue(changed)).toBe('5 кг');
		await expect(
			updateParam(actor, w.id, { defId: color.id, valueType: 'STRING', text: 'x' })
		).rejects.toThrow();

		await moveParam(actor, c.id, -1);
		expect((await listParams(actor, { typeId })).map((p) => p.key)).toEqual(['Цвет', 'Вес']);
		await moveParam(actor, c.id, -1);
		expect((await listParams(actor, { typeId })).map((p) => p.key)).toEqual(['Цвет', 'Вес']);

		await deleteParam(actor, c.id);
		expect((await listParams(actor, { typeId })).map((p) => p.key)).toEqual(['Вес']);

		const other = await createTestActor('other');
		await expect(deleteParam(other, w.id)).rejects.toThrow('не найден');
	});

	describe('definitions', () => {
		it('creates definitions with unique names and counts usage', async () => {
			const def = await createParamDef(actor, { name: 'Цвет', valueType: 'STRING' });
			await expect(createParamDef(actor, { name: ' цвет ', valueType: 'NUMBER' })).rejects.toThrow(
				'уже есть'
			);
			const other = await createTestActor('other');
			await createParamDef(other, { name: 'Цвет', valueType: 'STRING' });

			await setParams(
				actor,
				{ typeId },
				await keyed(actor, [{ key: 'Цвет', valueType: 'STRING', text: 'red' }])
			);
			await setParams(
				actor,
				{ itemId },
				await keyed(actor, [{ key: 'Цвет', valueType: 'STRING', text: 'blue' }])
			);
			expect(await listParamDefs(actor)).toEqual([
				expect.objectContaining({ id: def.id, name: 'Цвет', typeCount: 1, itemCount: 1 })
			]);
			const card = await getParamDef(actor, def.id);
			expect(card.types.map((t) => t.name)).toEqual(['Паяльник']);
			expect(card.items.map((i) => i.id)).toEqual([itemId]);
		});

		it('needs a list for ENUM and checks it belongs to the actor', async () => {
			await expect(createParamDef(actor, { name: 'Состояние', valueType: 'ENUM' })).rejects.toThrow(
				'выпадающий список'
			);
			const other = await createTestActor('other');
			const foreign = await createDictionary(other, { name: 'Чужой', options: [] });
			await expect(
				createParamDef(actor, { name: 'Состояние', valueType: 'ENUM', dictionaryId: foreign.id })
			).rejects.toThrow('не найден');
			const list = await conditionDictionary();
			const def = await createParamDef(actor, {
				name: 'Состояние',
				valueType: 'ENUM',
				dictionaryId: list.id
			});
			expect(def.dictionaryName).toBe('Состояние');
		});

		it('renames freely but changes the value type only while unused', async () => {
			const def = await createParamDef(actor, { name: 'Вес', valueType: 'STRING' });
			const changed = await updateParamDef(actor, def.id, { name: 'Масса', valueType: 'NUMBER' });
			expect(changed).toMatchObject({ name: 'Масса', valueType: 'NUMBER' });
			await addParam(actor, { itemId }, { defId: def.id, valueType: 'NUMBER', value: 1 });
			expect((await listParams(actor, { itemId }))[0]!.key).toBe('Масса');
			await expect(
				updateParamDef(actor, def.id, { name: 'Масса', valueType: 'STRING' })
			).rejects.toThrow('только пока');
			await expect(deleteParamDef(actor, def.id)).rejects.toThrow('сначала удалите');
			await setParams(actor, { itemId }, []);
			await deleteParamDef(actor, def.id);
			expect(await listParamDefs(actor)).toEqual([]);
		});
	});
});
