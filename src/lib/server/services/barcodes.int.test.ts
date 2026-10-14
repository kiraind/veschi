import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { removeBarcode, resolveBarcode, setBarcode } from './barcodes';
import { createItem } from './items';
import { search } from './search';
import { createType, deleteType, getType, listTypes } from './types';

const MILK = '4607001771531';
const COLA_UPC_A = '036000291452';
const COLA = '0036000291452';

describe('barcodes', () => {
	let actor: Actor;
	let milk: string;

	const barcodeOf = async (id: string) => (await getType(actor, id)).barcode;

	beforeEach(async () => {
		actor = await createTestActor();
		milk = (await createType(actor, { name: 'Молоко' })).id;
	});

	it('links a barcode to a type and finds the type by it', async () => {
		expect(await setBarcode(actor, milk, '4 607001 771531')).toBe(MILK);
		expect(await resolveBarcode(actor, MILK)).toEqual({
			status: 'known',
			code: MILK,
			type: { id: milk, name: 'Молоко' }
		});
		expect(await barcodeOf(milk)).toBe(MILK);
	});

	it('stores UPC-A as its EAN-13', async () => {
		await setBarcode(actor, milk, COLA_UPC_A);
		expect(await barcodeOf(milk)).toBe(COLA);
		expect((await resolveBarcode(actor, COLA_UPC_A)).status).toBe('known');
	});

	it('keeps one barcode per type, replaced only on request', async () => {
		await setBarcode(actor, milk, MILK);
		// The same one again changes nothing.
		await setBarcode(actor, milk, MILK);
		await expect(setBarcode(actor, milk, COLA)).rejects.toThrow(/уже есть штрихкод/);
		await setBarcode(actor, milk, COLA, { replace: true });
		expect(await barcodeOf(milk)).toBe(COLA);
		expect((await resolveBarcode(actor, MILK)).status).toBe('unknown');
	});

	it('tells an unknown barcode from text that is no barcode', async () => {
		expect(await resolveBarcode(actor, MILK)).toEqual({ status: 'unknown', code: MILK });
		expect(await resolveBarcode(actor, '4607001771532')).toEqual({ status: 'invalid' });
		await expect(setBarcode(actor, milk, '12345')).rejects.toThrow(/не штрихкод/);
	});

	it('links a barcode to one type only', async () => {
		await setBarcode(actor, milk, MILK);
		const kefir = (await createType(actor, { name: 'Кефир' })).id;
		await expect(setBarcode(actor, kefir, MILK, { replace: true })).rejects.toThrow(
			/уже привязан к типу «Молоко»/
		);
		expect(await barcodeOf(kefir)).toBeNull();
	});

	it('keeps barcodes of each user apart', async () => {
		await setBarcode(actor, milk, MILK);
		const other = await createTestActor('other');
		expect(await resolveBarcode(other, MILK)).toEqual({ status: 'unknown', code: MILK });
		const own = (await createType(other, { name: 'Своё молоко' })).id;
		await setBarcode(other, own, MILK);
		await expect(setBarcode(other, milk, COLA)).rejects.toThrow(/Тип не найден/);
	});

	it('unlinks a barcode and records the history', async () => {
		await setBarcode(actor, milk, MILK);
		await setBarcode(actor, milk, COLA, { replace: true });
		await removeBarcode(actor, milk);
		// Nothing to unlink: nothing happens.
		await removeBarcode(actor, milk);
		expect(await barcodeOf(milk)).toBeNull();
		const events = await db.historyEvent.findMany({
			where: { kind: 'type.barcode' },
			orderBy: { createdAt: 'asc' }
		});
		expect(events.map((e) => e.data)).toEqual([
			{ code: MILK, removed: false },
			{ code: COLA, removed: false, previous: MILK },
			{ code: COLA, removed: true }
		]);
	});

	it('creates an item with a barcode for a new or an existing type', async () => {
		const { id } = await createItem(actor, { newTypeName: 'Кефир', barcode: MILK });
		const kefir = (await db.item.findUniqueOrThrow({ where: { id } })).typeId!;
		expect(await barcodeOf(kefir)).toBe(MILK);

		await createItem(actor, { typeId: milk, barcode: COLA_UPC_A });
		expect(await barcodeOf(milk)).toBe(COLA);

		// A barcode of another type: nothing is created.
		await expect(createItem(actor, { newTypeName: 'Сок', barcode: MILK })).rejects.toThrow(
			/уже привязан/
		);
		expect(await db.itemType.count({ where: { name: 'Сок' } })).toBe(0);
		// A type with another barcode keeps it.
		await expect(createItem(actor, { typeId: milk, barcode: '96385074' })).rejects.toThrow(
			/уже есть штрихкод/
		);
	});

	it('finds things and types by barcode digits', async () => {
		await setBarcode(actor, milk, MILK);
		await createItem(actor, { typeId: milk, quantity: 2 });
		await createItem(actor, { newTypeName: 'Кефир', quantity: 1 });
		for (const query of [MILK, '4 607001 771531', '7715']) {
			expect((await search(actor, query)).map((g) => g.typeName)).toEqual(['Молоко']);
		}
		expect(await search(actor, '460')).toEqual([]);
		expect((await listTypes(actor, '1771')).map((t) => t.name)).toEqual(['Молоко']);
	});

	it('goes away with its type', async () => {
		await setBarcode(actor, milk, MILK);
		await deleteType(actor, milk);
		expect((await resolveBarcode(actor, MILK)).status).toBe('unknown');
	});
});
