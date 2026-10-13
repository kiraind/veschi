import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { addBarcode, barcodesOf, removeBarcode, resolveBarcode } from './barcodes';
import { createItem } from './items';
import { search } from './search';
import { createType, deleteType, getTypeCard, listTypes } from './types';

const MILK = '4607001771531';
const COLA_UPC_A = '036000291452';
const COLA = '0036000291452';

describe('barcodes', () => {
	let actor: Actor;
	let milk: string;

	beforeEach(async () => {
		actor = await createTestActor();
		milk = (await createType(actor, { name: 'Молоко' })).id;
	});

	it('links a barcode to a type and finds the type by it', async () => {
		expect(await addBarcode(actor, milk, '4 607001 771531')).toBe(MILK);
		expect(await resolveBarcode(actor, MILK)).toEqual({
			status: 'known',
			code: MILK,
			type: { id: milk, name: 'Молоко' }
		});
		expect((await getTypeCard(actor, milk)).barcodes).toEqual([MILK]);
	});

	it('keeps several barcodes of a type, and UPC-A as its EAN-13', async () => {
		await addBarcode(actor, milk, MILK);
		await addBarcode(actor, milk, COLA_UPC_A);
		expect(await barcodesOf(milk)).toEqual([MILK, COLA]);
		expect((await resolveBarcode(actor, COLA)).status).toBe('known');
	});

	it('tells an unknown barcode from text that is no barcode', async () => {
		expect(await resolveBarcode(actor, MILK)).toEqual({ status: 'unknown', code: MILK });
		expect(await resolveBarcode(actor, '4607001771532')).toEqual({ status: 'invalid' });
		await expect(addBarcode(actor, milk, '12345')).rejects.toThrow(/не штрихкод/);
	});

	it('links a barcode to one type only', async () => {
		await addBarcode(actor, milk, MILK);
		// Again to the same type: nothing changes.
		await addBarcode(actor, milk, MILK);
		const kefir = (await createType(actor, { name: 'Кефир' })).id;
		await expect(addBarcode(actor, kefir, MILK)).rejects.toThrow(/уже привязан к типу «Молоко»/);
		expect(await db.typeBarcode.count()).toBe(1);
	});

	it('keeps barcodes of each user apart', async () => {
		await addBarcode(actor, milk, MILK);
		const other = await createTestActor('other');
		expect(await resolveBarcode(other, MILK)).toEqual({ status: 'unknown', code: MILK });
		const own = (await createType(other, { name: 'Своё молоко' })).id;
		await addBarcode(other, own, MILK);
		await expect(addBarcode(other, milk, COLA)).rejects.toThrow(/Тип не найден/);
	});

	it('unlinks a barcode and records both in the history', async () => {
		await addBarcode(actor, milk, MILK);
		await removeBarcode(actor, milk, MILK);
		expect(await barcodesOf(milk)).toEqual([]);
		await expect(removeBarcode(actor, milk, MILK)).rejects.toThrow(/нет такого штрихкода/);
		const events = await db.historyEvent.findMany({
			where: { kind: 'type.barcode' },
			orderBy: { createdAt: 'asc' }
		});
		expect(events.map((e) => e.data)).toEqual([
			{ code: MILK, removed: false },
			{ code: MILK, removed: true }
		]);
	});

	it('creates an item with a barcode for a new or an existing type', async () => {
		const { id } = await createItem(actor, { newTypeName: 'Кефир', barcode: MILK });
		const kefir = (await db.item.findUniqueOrThrow({ where: { id } })).typeId!;
		expect(await barcodesOf(kefir)).toEqual([MILK]);

		await createItem(actor, { typeId: milk, barcode: COLA_UPC_A });
		expect(await barcodesOf(milk)).toEqual([COLA]);

		// A barcode of another type: nothing is created.
		await expect(createItem(actor, { newTypeName: 'Сок', barcode: MILK })).rejects.toThrow(
			/уже привязан/
		);
		expect(await db.itemType.count({ where: { name: 'Сок' } })).toBe(0);
	});

	it('finds things and types by barcode digits', async () => {
		await addBarcode(actor, milk, MILK);
		await createItem(actor, { typeId: milk, quantity: 2 });
		await createItem(actor, { newTypeName: 'Кефир', quantity: 1 });
		for (const query of [MILK, '4 607001 771531', '7715']) {
			expect((await search(actor, query)).map((g) => g.typeName)).toEqual(['Молоко']);
		}
		expect(await search(actor, '460')).toEqual([]);
		expect((await listTypes(actor, '1771')).map((t) => t.name)).toEqual(['Молоко']);
	});

	it('goes away with its type', async () => {
		await addBarcode(actor, milk, MILK);
		await deleteType(actor, milk);
		expect(await db.typeBarcode.count()).toBe(0);
	});
});
