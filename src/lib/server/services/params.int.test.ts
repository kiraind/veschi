import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { formatParamValue, type ParamInput } from '$lib/domain/params';
import { createDictionary, updateDictionary } from './dictionaries';
import { uploadParamFile } from './files';
import { createItem } from './items';
import { listParams, setParams } from './params';

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
		const inputs: ParamInput[] = [
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
		const saved = await setParams(actor, { itemId }, inputs);
		expect(saved).toMatchObject(inputs);
		expect(saved.map(formatParamValue)).toEqual([
			'DIP-8',
			'85 мм',
			'4\u202f500 ₽',
			'4,5–16 В',
			'USB, Bluetooth',
			'https://example.com/ne555.pdf',
			'manual.pdf',
			'1 мая 2027',
			'Блок питания 12 В',
			'Паяльник',
			'нет'
		]);
	});

	it('replaces the whole list in order', async () => {
		await setParams(actor, { typeId }, [
			{ key: 'a', valueType: 'STRING', text: '1' },
			{ key: 'b', valueType: 'STRING', text: '2' }
		]);
		await setParams(actor, { typeId }, [
			{ key: 'c', valueType: 'BOOLEAN', value: true },
			{ key: 'a', valueType: 'STRING', text: '3' }
		]);
		expect((await listParams(actor, { typeId })).map((p) => p.key)).toEqual(['c', 'a']);
		await setParams(actor, { typeId }, []);
		expect(await listParams(actor, { typeId })).toEqual([]);
	});

	it('rejects a range with min > max and changes nothing', async () => {
		await setParams(actor, { itemId }, [{ key: 'a', valueType: 'STRING', text: '1' }]);
		await expect(
			setParams(actor, { itemId }, [{ key: 'питание', valueType: 'RANGE', min: 16, max: 4.5 }])
		).rejects.toThrow('Минимум больше максимума');
		expect((await listParams(actor, { itemId })).map((p) => p.key)).toEqual(['a']);
	});

	it('rejects two options of a single-choice dictionary and allows them for multiple', async () => {
		const single = await conditionDictionary(false);
		await expect(
			setParams(actor, { itemId }, [
				{
					key: 'состояние',
					valueType: 'ENUM',
					dictionaryId: single.id,
					optionIds: [single.options[0]!.id, single.options[1]!.id]
				}
			])
		).rejects.toThrow('только один вариант');
		const multiple = await conditionDictionary(true);
		const saved = await setParams(actor, { itemId }, [
			{
				key: 'интерфейсы',
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
			await setParams(actor, { itemId: id }, [
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
			setParams(actor, { itemId }, [
				{ key: 'x', valueType: 'ENUM', dictionaryId: a.id, optionIds: [b.options[0]!.id] }
			])
		).rejects.toThrow('нет в справочнике');

		const other = await createTestActor('other');
		const foreign = await createItem(other, { newTypeName: 'Чужое' });
		await expect(
			setParams(actor, { itemId }, [{ key: 'x', valueType: 'REF', refItemId: foreign.id }])
		).rejects.toThrow('не найдены');

		const file = await uploadParamFile(other, {
			name: 'a.txt',
			type: 'text/plain',
			data: Buffer.from('a')
		});
		await expect(setParams(actor, { itemId }, [{ key: 'x', ...file }])).rejects.toThrow(
			'файл не найден'
		);
	});

	it('deletes the stored file when its parameter is removed', async () => {
		const file = await uploadParamFile(actor, {
			name: 'a.txt',
			type: 'text/plain',
			data: Buffer.from('a')
		});
		await setParams(actor, { itemId }, [{ key: 'файл', ...file }]);
		expect(await storage().get(file.fileKey)).not.toBeNull();
		await setParams(actor, { itemId }, []);
		expect(await storage().get(file.fileKey)).toBeNull();
	});

	it('rejects duplicate keys and other users’ targets', async () => {
		await expect(
			setParams(actor, { itemId }, [
				{ key: 'Цвет', valueType: 'STRING', text: '1' },
				{ key: 'цвет', valueType: 'STRING', text: '2' }
			])
		).rejects.toThrow();
		const other = await createTestActor('other');
		await expect(setParams(other, { typeId }, [])).rejects.toThrow('Тип не найден');
	});
});
