import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { createItem } from './items';
import { setParams } from './params';
import {
	createType,
	deleteType,
	findOrCreateType,
	getTypeCard,
	listTypes,
	removeTypePhoto,
	setTypePhoto,
	updateType
} from './types';

function png(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } }
	})
		.png()
		.toBuffer();
}

describe('types', () => {
	let actor: Actor;

	beforeEach(async () => {
		actor = await createTestActor();
	});

	it('creates, renames and lists types with item counts and autocomplete', async () => {
		const knife = await createType(actor, { name: 'Нож Victorinox' });
		await createType(actor, { name: 'NE555' });
		await createItem(actor, { typeId: knife.id });
		await updateType(actor, knife.id, { name: 'Нож Victorinox Huntsman' });

		expect((await listTypes(actor)).map((t) => [t.name, t.itemCount])).toEqual([
			['NE555', 0],
			['Нож Victorinox Huntsman', 1]
		]);
		expect((await listTypes(actor, 'hunts')).map((t) => t.id)).toEqual([knife.id]);
		const other = await createTestActor('other');
		expect(await listTypes(other)).toEqual([]);
	});

	it('finds an existing type by name instead of creating a duplicate', async () => {
		const a = await findOrCreateType(actor, 'NE555');
		const b = await findOrCreateType(actor, ' ne555 ');
		expect(b.id).toBe(a.id);
		expect(await db.itemType.count()).toBe(1);
	});

	it('shows its parameters and items with locations on the type card', async () => {
		const type = await createType(actor, { name: 'NE555' });
		const box = await createItem(actor, { newTypeName: 'Коробка', name: 'Коробка с микросхемами' });
		await createItem(actor, { typeId: type.id, quantity: 10, parentId: box.id });
		await setParams(actor, { typeId: type.id }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const card = await getTypeCard(actor, type.id);
		expect(card.params).toMatchObject([{ key: 'корпус', text: 'DIP-8' }]);
		expect(card.items).toMatchObject([
			{ name: 'NE555', quantity: 10, path: [{ name: 'Коробка с микросхемами' }] }
		]);
	});

	describe('photo', () => {
		it('stores a WebP of at most 1600 px and replaces the old photo', async () => {
			const type = await createType(actor, { name: 'Нож' });
			const first = await setTypePhoto(actor, type.id, await png(3200, 1000));
			const stored = await storage().get(first);
			expect(stored?.contentType).toBe('image/webp');
			const chunks: Buffer[] = [];
			for await (const chunk of stored!.body) chunks.push(chunk as Buffer);
			const meta = await sharp(Buffer.concat(chunks)).metadata();
			expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1600, 500]);

			const second = await setTypePhoto(actor, type.id, await png(100, 100));
			expect(second).not.toBe(first);
			expect(await storage().get(first)).toBeNull();
			expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).photoKey).toBe(
				second
			);

			await removeTypePhoto(actor, type.id);
			expect(await storage().get(second)).toBeNull();
		});

		it('rejects data that is not an image', async () => {
			const type = await createType(actor, { name: 'Нож' });
			await expect(setTypePhoto(actor, type.id, Buffer.from('not an image'))).rejects.toThrow(
				'изображение'
			);
		});
	});

	describe('deleteType', () => {
		it('deletes an unused type with its photo', async () => {
			const type = await createType(actor, { name: 'Старое' });
			const photo = await setTypePhoto(actor, type.id, await png(10, 10));
			await deleteType(actor, type.id);
			expect(await db.itemType.count()).toBe(0);
			expect(await storage().get(photo)).toBeNull();
		});

		it('keeps a type that has items, even archived ones', async () => {
			const type = await createType(actor, { name: 'NE555' });
			const item = await createItem(actor, { typeId: type.id });
			await db.item.update({ where: { id: item.id }, data: { status: 'ARCHIVED' } });
			await expect(deleteType(actor, type.id)).rejects.toThrow('есть вещи');
		});

		it('keeps a type referenced by a parameter', async () => {
			const type = await createType(actor, { name: 'Блок питания' });
			const item = await createItem(actor, { newTypeName: 'Паяльник' });
			await setParams(actor, { itemId: item.id }, [
				{ key: 'зарядка', valueType: 'REF', refTypeId: type.id }
			]);
			await expect(deleteType(actor, type.id)).rejects.toThrow('ссылаются');
		});
	});
});
