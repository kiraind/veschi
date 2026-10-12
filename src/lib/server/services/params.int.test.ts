import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { formatParamValue } from '$lib/domain/params';
import {
	enumDef,
	keyed,
	optionId,
	setKeyedParams,
	type KeyedParam
} from '$lib/server/testing/params';
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

	function condition() {
		return enumDef(actor, 'Состояние', ['новое', 'б/у', 'сломано']);
	}

	function interfaces(name = 'Интерфейсы') {
		return enumDef(actor, name, ['USB', 'Bluetooth'], true);
	}

	it('stores and shows every value type without loss', async () => {
		const interfacesDef = await interfaces();
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
				key: 'Интерфейсы',
				valueType: 'ENUM',
				optionIds: interfacesDef.options.map((o) => o.id)
			},
			{ key: 'даташит', valueType: 'URL', url: 'https://example.com/ne555.pdf' },
			{ key: 'инструкция', ...file },
			{ key: 'гарантия до', valueType: 'DATE', date: '2027-05-01' },
			{ key: 'зарядка', valueType: 'ITEM', refIds: [charger.id] },
			{ key: 'тип зарядки', valueType: 'TYPE', refIds: [typeId], holder: 'ITEM' },
			{ key: 'работает', valueType: 'BOOLEAN', value: false }
		];
		const saved = await setKeyedParams(actor, { itemId }, inputs);
		expect(saved).toMatchObject(inputs.map(({ holder: _holder, ...p }) => p));
		expect(saved[4]!.defId).toBe(interfacesDef.id);
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

	it('rejects two options of a single-choice parameter and allows them for multiple', async () => {
		const single = await condition();
		await expect(
			setKeyedParams(actor, { itemId }, [
				{
					key: 'состояние',
					valueType: 'ENUM',
					optionIds: [single.options[0]!.id, single.options[1]!.id]
				}
			])
		).rejects.toThrow('только один вариант');
		const multiple = await interfaces();
		const saved = await setKeyedParams(actor, { itemId }, [
			{ key: 'интерфейсы', valueType: 'ENUM', optionIds: multiple.options.map((o) => o.id) }
		]);
		expect(saved[0]!.options?.map((o) => o.label)).toEqual(['USB', 'Bluetooth']);
	});

	it('rejects options of another parameter, foreign refs and foreign files', async () => {
		await condition();
		const b = await interfaces();
		await expect(
			setKeyedParams(actor, { itemId }, [
				{ key: 'состояние', valueType: 'ENUM', optionIds: [b.options[0]!.id] }
			])
		).rejects.toThrow('нет в списке');

		const other = await createTestActor('other');
		const foreign = await createItem(other, { newTypeName: 'Чужое' });
		await expect(
			setKeyedParams(actor, { itemId }, [{ key: 'x2', valueType: 'ITEM', refIds: [foreign.id] }])
		).rejects.toThrow('вещь не найдена');

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
			value: 5
		});
		expect(formatParamValue(changed)).toBe('5');
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

		it('keeps the unit on the definition and shows it in every value', async () => {
			const def = await createParamDef(actor, { name: 'Длина', valueType: 'NUMBER', unit: 'мм' });
			expect(def).toMatchObject({ unit: 'мм', multiple: false, options: [] });
			const other = (await createItem(actor, { typeId })).id;
			await addParam(actor, { typeId }, { defId: def.id, valueType: 'NUMBER', value: 85 });
			await addParam(actor, { itemId: other }, { defId: def.id, valueType: 'NUMBER', value: 4.5 });
			expect((await listParams(actor, { typeId })).map(formatParamValue)).toEqual(['85 мм']);

			await updateParamDef(actor, def.id, { name: 'Длина', valueType: 'NUMBER', unit: 'см' });
			expect((await listParams(actor, { typeId })).map(formatParamValue)).toEqual(['85 см']);
			expect((await listParams(actor, { itemId: other }))[0]).toMatchObject({
				value: 4.5,
				unit: 'см'
			});
			expect(await db.param.findFirstOrThrow({ where: { itemId: other } })).not.toHaveProperty(
				'unit'
			);

			await updateParamDef(actor, def.id, { name: 'Длина', valueType: 'NUMBER' });
			expect((await listParams(actor, { typeId })).map(formatParamValue)).toEqual(['85']);
		});

		it('stores no unit for values that are not numbers', async () => {
			const def = await createParamDef(actor, { name: 'Цвет', valueType: 'STRING', unit: 'мм' });
			expect(def.unit).toBeNull();
			const range = await createParamDef(actor, { name: 'Питание', valueType: 'RANGE', unit: 'В' });
			const saved = await addParam(
				actor,
				{ itemId },
				{ defId: range.id, valueType: 'RANGE', min: 4.5, max: 16 }
			);
			expect(formatParamValue(saved)).toBe('4,5–16 В');
		});
	});

	describe('drop-down (ENUM) definitions', () => {
		it('creates a definition with its own ordered options', async () => {
			const def = await condition();
			expect(def).toMatchObject({
				name: 'Состояние',
				valueType: 'ENUM',
				unit: null,
				multiple: false,
				typeCount: 0,
				itemCount: 0
			});
			expect(def.options.map((o) => [o.label, o.usage])).toEqual([
				['новое', 0],
				['б/у', 0],
				['сломано', 0]
			]);
			expect(await db.enumDictionary.count()).toBe(1);
			expect((await listParamDefs(actor)).map((d) => d.options.length)).toEqual([3]);
			const empty = await createParamDef(actor, { name: 'Пусто', valueType: 'ENUM' });
			expect(empty.options).toEqual([]);
		});

		it('rejects option ids when creating', async () => {
			const def = await condition();
			await expect(
				createParamDef(actor, {
					name: 'Другое',
					valueType: 'ENUM',
					options: [{ id: def.options[0]!.id, label: 'новое' }]
				})
			).rejects.toThrow('не бывает id');
		});

		it('renames, reorders, adds and removes unused options keeping ids', async () => {
			const def = await condition();
			const [fresh, used, broken] = def.options;
			const updated = await updateParamDef(actor, def.id, {
				name: 'Состояние вещи',
				valueType: 'ENUM',
				options: [
					{ id: broken!.id, label: 'сломано' },
					{ id: used!.id, label: 'Б/У' },
					{ label: 'в ремонте' }
				]
			});
			expect(updated.name).toBe('Состояние вещи');
			expect(updated.options.map((o) => o.label)).toEqual(['сломано', 'Б/У', 'в ремонте']);
			expect(updated.options.slice(0, 2).map((o) => o.id)).toEqual([broken!.id, used!.id]);
			expect(updated.options.some((o) => o.id === fresh!.id)).toBe(false);
			expect(await db.enumOption.count()).toBe(3);
		});

		it('rejects an option id of another parameter', async () => {
			const def = await condition();
			const other = await interfaces();
			await expect(
				updateParamDef(actor, def.id, {
					name: def.name,
					valueType: 'ENUM',
					options: [...def.options, { id: other.options[0]!.id, label: 'USB' }]
				})
			).rejects.toThrow('Вариант не из этого параметра');
		});

		it('shows a renamed option in every value', async () => {
			const def = await condition();
			const used = optionId(def, 'б/у');
			const other = (await createItem(actor, { typeId })).id;
			for (const target of [{ itemId }, { itemId: other }, { typeId }]) {
				await setKeyedParams(actor, target, [
					{ key: 'состояние', valueType: 'ENUM', optionIds: [used] }
				]);
			}
			const updated = await updateParamDef(actor, def.id, {
				name: 'Состояние',
				valueType: 'ENUM',
				options: def.options.map((o) => (o.id === used ? { id: o.id, label: 'Б/У' } : o))
			});
			expect(updated).toMatchObject({ typeCount: 1, itemCount: 2 });
			expect(updated.options.find((o) => o.id === used)?.usage).toBe(3);
			for (const target of [{ itemId }, { itemId: other }, { typeId }]) {
				const [value] = await listParams(actor, target);
				expect(value!.options).toEqual([{ id: used, label: 'Б/У' }]);
				expect(formatParamValue(value!)).toBe('Б/У');
			}
		});

		it('rejects removing an option chosen in a value and changes nothing', async () => {
			const def = await condition();
			await setKeyedParams(actor, { itemId }, [
				{ key: 'состояние', valueType: 'ENUM', optionIds: [optionId(def, 'б/у')] }
			]);
			await expect(
				updateParamDef(actor, def.id, {
					name: 'Состояние 2',
					valueType: 'ENUM',
					options: [def.options[0], def.options[2]]
				})
			).rejects.toThrow('«б/у» выбран в значениях (1)');
			const card = await getParamDef(actor, def.id);
			expect(card.def.name).toBe('Состояние');
			expect(card.def.options.map((o) => o.label)).toEqual(['новое', 'б/у', 'сломано']);
		});

		it('cannot become single-choice while a value has several options', async () => {
			const def = await interfaces();
			const ids = def.options.map((o) => o.id);
			await setKeyedParams(actor, { itemId }, [
				{ key: 'интерфейсы', valueType: 'ENUM', optionIds: ids }
			]);
			const single = { name: def.name, valueType: 'ENUM', multiple: false, options: def.options };
			await expect(updateParamDef(actor, def.id, single)).rejects.toThrow('одиночным');
			expect((await getParamDef(actor, def.id)).def.multiple).toBe(true);
			await setKeyedParams(actor, { itemId }, [
				{ key: 'интерфейсы', valueType: 'ENUM', optionIds: [ids[0]!] }
			]);
			expect((await updateParamDef(actor, def.id, single)).multiple).toBe(false);
		});

		it('rejects duplicate labels', async () => {
			await expect(
				createParamDef(actor, {
					name: 'Интерфейсы',
					valueType: 'ENUM',
					options: [{ label: 'USB' }, { label: 'usb' }]
				})
			).rejects.toThrow('Вариант «usb» повторяется');
			expect(await db.paramDef.count()).toBe(0);
			expect(await db.enumDictionary.count()).toBe(0);
			const def = await condition();
			await expect(
				updateParamDef(actor, def.id, {
					name: def.name,
					valueType: 'ENUM',
					options: [...def.options, { label: 'Новое' }]
				})
			).rejects.toThrow('повторяется');
		});

		it('switches to another value type while unused, deleting or creating the list', async () => {
			const def = await condition();
			const asString = await updateParamDef(actor, def.id, {
				name: 'Состояние',
				valueType: 'STRING',
				options: def.options
			});
			expect(asString).toMatchObject({ valueType: 'STRING', multiple: false, options: [] });
			expect(await db.enumDictionary.count()).toBe(0);
			expect(await db.enumOption.count()).toBe(0);

			const asEnum = await updateParamDef(actor, def.id, {
				name: 'Состояние',
				valueType: 'ENUM',
				multiple: true,
				options: [{ label: 'целое' }]
			});
			expect(asEnum).toMatchObject({ valueType: 'ENUM', multiple: true });
			expect(asEnum.options.map((o) => o.label)).toEqual(['целое']);
			expect(await db.enumDictionary.count()).toBe(1);
		});

		it('keeps the value type while some value uses it', async () => {
			const def = await condition();
			await setKeyedParams(actor, { typeId }, [
				{ key: 'состояние', valueType: 'ENUM', optionIds: [optionId(def, 'новое')] }
			]);
			await expect(
				updateParamDef(actor, def.id, { name: 'Состояние', valueType: 'STRING' })
			).rejects.toThrow('только пока');
			expect(await db.enumDictionary.count()).toBe(1);
		});

		it('deletes the option list with an unused definition', async () => {
			const def = await condition();
			const kept = await interfaces();
			await setKeyedParams(actor, { itemId }, [
				{ key: 'состояние', valueType: 'ENUM', optionIds: [optionId(def, 'новое')] }
			]);
			await expect(deleteParamDef(actor, def.id)).rejects.toThrow('сначала удалите');
			await setParams(actor, { itemId }, []);
			await deleteParamDef(actor, def.id);
			expect((await listParamDefs(actor)).map((d) => d.id)).toEqual([kept.id]);
			expect(await db.enumDictionary.count()).toBe(1);
			expect(await db.enumOption.count()).toBe(2);
		});

		it('hides definitions and their options from other users', async () => {
			const def = await condition();
			const other = await createTestActor('other');
			expect(await listParamDefs(other)).toEqual([]);
			await expect(
				updateParamDef(other, def.id, { name: 'X', valueType: 'ENUM', options: [] })
			).rejects.toThrow('не найден');
			await expect(deleteParamDef(other, def.id)).rejects.toThrow('не найден');
		});
	});

	describe('definition changes', () => {
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
