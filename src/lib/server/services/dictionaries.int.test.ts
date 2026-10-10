import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import {
	createDictionary,
	deleteDictionary,
	getDictionary,
	listDictionaries,
	updateDictionary,
	type DictionaryView
} from './dictionaries';
import { createItem } from './items';
import { setParams } from './params';

type Opt = DictionaryView['options'][number];

describe('dictionaries', () => {
	let actor: Actor;
	let itemId: string;

	beforeEach(async () => {
		actor = await createTestActor();
		itemId = (await createItem(actor, { newTypeName: 'Паяльник' })).id;
	});

	function condition() {
		return createDictionary(actor, {
			name: 'Состояние',
			options: [{ label: 'новое' }, { label: 'б/у' }, { label: 'сломано' }]
		});
	}

	async function use(dictionaryId: string, optionIds: string[], id = itemId) {
		await setParams(actor, { itemId: id }, [
			{ key: 'состояние', valueType: 'ENUM', dictionaryId, optionIds }
		]);
	}

	it('creates a dictionary with ordered options', async () => {
		const d = await condition();
		expect(d).toMatchObject({ name: 'Состояние', multiple: false, usage: 0 });
		expect(d.options.map((o) => o.label)).toEqual(['новое', 'б/у', 'сломано']);
		expect((await listDictionaries(actor)).map((x) => x.id)).toEqual([d.id]);
		const other = await createTestActor('other');
		expect(await listDictionaries(other)).toEqual([]);
	});

	it('renames, reorders, adds and removes unused options keeping ids', async () => {
		const d = await condition();
		const [fresh, used, broken] = d.options as [Opt, Opt, Opt];
		const updated = await updateDictionary(actor, d.id, {
			name: 'Состояние вещи',
			options: [
				{ id: broken.id, label: 'сломано' },
				{ id: used.id, label: 'Б/У' },
				{ label: 'в ремонте' }
			]
		});
		expect(updated.name).toBe('Состояние вещи');
		expect(updated.options.map((o) => o.label)).toEqual(['сломано', 'Б/У', 'в ремонте']);
		expect(updated.options.slice(0, 2).map((o) => o.id)).toEqual([broken.id, used.id]);
		expect(updated.options.some((o) => o.id === fresh.id)).toBe(false);
	});

	it('rejects deleting an option that is in use', async () => {
		const d = await condition();
		await use(d.id, [d.options[1]!.id]);
		expect((await getDictionary(actor, d.id)).options[1]!.usage).toBe(1);
		await expect(
			updateDictionary(actor, d.id, { name: d.name, options: [d.options[0], d.options[2]] })
		).rejects.toThrow('«б/у» используется');
	});

	it('rejects duplicate labels', async () => {
		await expect(
			createDictionary(actor, { name: 'X', options: [{ label: 'USB' }, { label: 'usb' }] })
		).rejects.toThrow('повторяется');
	});

	it('cannot become single-choice while a parameter has several options', async () => {
		const d = await createDictionary(actor, {
			name: 'Интерфейсы',
			multiple: true,
			options: [{ label: 'USB' }, { label: 'Bluetooth' }]
		});
		await use(
			d.id,
			d.options.map((o) => o.id)
		);
		await expect(
			updateDictionary(actor, d.id, { name: d.name, multiple: false, options: d.options })
		).rejects.toThrow('одиночным');
		await use(d.id, [d.options[0]!.id]);
		const updated = await updateDictionary(actor, d.id, {
			name: d.name,
			multiple: false,
			options: d.options
		});
		expect(updated.multiple).toBe(false);
	});

	it('deletes only an unused dictionary', async () => {
		const d = await condition();
		await use(d.id, [d.options[0]!.id]);
		await expect(deleteDictionary(actor, d.id)).rejects.toThrow('используется');
		await setParams(actor, { itemId }, []);
		await deleteDictionary(actor, d.id);
		expect(await listDictionaries(actor)).toEqual([]);
	});
});
