import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { createItem, getItemCard, moveItem } from './items';
import { setKeyedParams } from '$lib/server/testing/params';
import { createWorkbench, relocate, take } from './workbench';
import { openFile, thumbKeyOf } from './files';
import {
	createType,
	deleteType,
	findOrCreateType,
	getType,
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
		await createItem(actor, { typeId: knife.id, quantity: 2, name: 'Запасные' });
		await updateType(actor, knife.id, { name: 'Нож Victorinox Huntsman' });

		// Pieces, not records.
		expect((await listTypes(actor)).map((t) => [t.name, t.total])).toEqual([
			['NE555', 0],
			['Нож Victorinox Huntsman', 3]
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
		const box = await createItem(actor, {
			newTypeName: 'Коробка',
			name: 'Коробка с микросхемами',
			newTypeIsContainer: true
		});
		await createItem(actor, { typeId: type.id, quantity: 10, parentId: box.id });
		await setKeyedParams(actor, { typeId: type.id }, [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' }
		]);
		const card = await getTypeCard(actor, type.id);
		expect(card.params).toMatchObject([{ key: 'корпус', text: 'DIP-8' }]);
		expect(card.items).toMatchObject([
			{ name: 'NE555', quantity: 10, path: [{ name: 'Коробка с микросхемами' }] }
		]);
		expect(card.hasContents).toBe(false);
		const boxType = await db.item.findUniqueOrThrow({ where: { id: box.id } });
		expect((await getTypeCard(actor, boxType.typeId!)).hasContents).toBe(true);
	});

	it('marks a container type without contents', async () => {
		const box = await createItem(actor, { newTypeName: 'Коробка', newTypeIsContainer: true });
		const { typeId } = await db.item.findUniqueOrThrow({ where: { id: box.id } });
		expect((await getTypeCard(actor, typeId!)).hasContents).toBe(false);
	});

	describe('description', () => {
		it('stores a trimmed description, keeps it when omitted and clears it', async () => {
			const type = await createType(actor, {
				name: 'NE555',
				description: '  Таймер, корпус DIP-8 '
			});
			expect(type).toMatchObject({ description: 'Таймер, корпус DIP-8', isContainer: false });
			await updateType(actor, type.id, { name: 'NE555P' });
			expect((await getTypeCard(actor, type.id)).type).toMatchObject({
				name: 'NE555P',
				description: 'Таймер, корпус DIP-8'
			});
			await updateType(actor, type.id, { name: 'NE555P', description: '' });
			expect((await getTypeCard(actor, type.id)).type.description).toBeNull();
		});

		it('rejects a description longer than 2000 characters', async () => {
			const type = await createType(actor, { name: 'NE555' });
			await expect(
				updateType(actor, type.id, { name: 'NE555', description: 'а'.repeat(2001) })
			).rejects.toThrow('длиннее 2000');
		});

		it('finds types by name or description in autocomplete', async () => {
			const timer = await createType(actor, { name: 'NE555', description: 'Таймер' });
			const knife = await createType(actor, {
				name: 'Нож',
				description: 'Складной, для таймера нет'
			});
			await createType(actor, { name: 'Паяльник' });
			expect((await listTypes(actor, 'таймер')).map((t) => t.id)).toEqual([timer.id, knife.id]);
			expect((await listTypes(actor, 'СКЛАДН')).map((t) => [t.name, t.description])).toEqual([
				['Нож', 'Складной, для таймера нет']
			]);
			expect((await listTypes(actor, 'ne5')).map((t) => t.id)).toEqual([timer.id]);
		});
	});

	describe('container mark', () => {
		it('creates and lists a container type', async () => {
			const type = await createType(actor, { name: 'Коробка', isContainer: true });
			expect(type.isContainer).toBe(true);
			expect((await listTypes(actor)).map((t) => [t.name, t.isContainer])).toEqual([
				['Коробка', true]
			]);
			expect((await getTypeCard(actor, type.id)).type.isContainer).toBe(true);
		});

		it('becomes a container only when every item has quantity 1', async () => {
			const type = await createType(actor, { name: 'Пакет' });
			const single = await createItem(actor, { typeId: type.id });
			const several = await createItem(actor, { typeId: type.id, name: 'Пакеты', quantity: 3 });
			await db.item.update({ where: { id: several.id }, data: { status: 'ARCHIVED' } });
			await expect(
				updateType(actor, type.id, { name: 'Пакет', isContainer: true })
			).rejects.toThrow('а у «Пакеты» 3 штуки');
			expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).isContainer).toBe(
				false
			);
			await db.item.update({ where: { id: several.id }, data: { quantity: 1 } });
			await updateType(actor, type.id, { name: 'Пакет', isContainer: true });
			expect((await getItemCard(actor, single.id)).item.isContainer).toBe(true);
			await createItem(actor, { newTypeName: 'NE555', quantity: 5, parentId: single.id });
		});

		it('stops being a container only when nothing lies in its items or was taken from them', async () => {
			const type = await createType(actor, { name: 'Коробка', isContainer: true });
			const box = await createItem(actor, { typeId: type.id });
			const chip = await createItem(actor, { newTypeName: 'NE555', parentId: box.id });
			await expect(
				updateType(actor, type.id, { name: 'Коробка', isContainer: false })
			).rejects.toThrow('Внутри лежат вещи');

			const bench = await createWorkbench(actor, { name: 'Гараж' });
			await take(actor, chip.id, { workbenchId: bench.id });
			await expect(
				updateType(actor, type.id, { name: 'Коробка', isContainer: false })
			).rejects.toThrow('на рабочем столе');
			expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).isContainer).toBe(
				true
			);

			await relocate(actor, chip.id, null);
			await updateType(actor, type.id, { name: 'Коробка', isContainer: false });
			expect((await getItemCard(actor, box.id)).item.isContainer).toBe(false);
			await expect(moveItem(actor, chip.id, box.id)).rejects.toThrow('не контейнер');
		});

		it('keeps the mark when it is omitted', async () => {
			const type = await createType(actor, { name: 'Коробка', isContainer: true });
			await updateType(actor, type.id, { name: 'Ящик' });
			expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).isContainer).toBe(
				true
			);
		});

		it('creates a container type in findOrCreateType only when it is new', async () => {
			const created = await findOrCreateType(actor, 'Коробка', db, { isContainer: true });
			expect(created.isContainer).toBe(true);
			const plain = await createType(actor, { name: 'Пакет' });
			const found = await findOrCreateType(actor, 'пакет', db, { isContainer: true });
			expect(found).toMatchObject({ id: plain.id, isContainer: false });
		});
	});

	it('matches % and _ in names literally', async () => {
		const resistor = await createType(actor, { name: 'Резистор 10 кОм' });
		await createType(actor, { name: 'axb' });
		const percent = await findOrCreateType(actor, 'Резистор%');
		expect(percent.id).not.toBe(resistor.id);
		expect((await findOrCreateType(actor, 'a_b')).name).toBe('a_b');
		expect((await findOrCreateType(actor, 'РЕЗИСТОР%')).id).toBe(percent.id);
		expect((await listTypes(actor, '%')).map((t) => t.name)).toEqual(['Резистор%']);
	});

	describe('photo', () => {
		it('stores a square WebP and a thumbnail, and replaces the old photo', async () => {
			const type = await createType(actor, { name: 'Нож' });
			const first = await setTypePhoto(actor, type.id, await png(3200, 1000));
			const read = async (key: string) => {
				const stored = await storage().get(key);
				expect(stored?.contentType).toBe('image/webp');
				const chunks: Buffer[] = [];
				for await (const chunk of stored!.body) chunks.push(chunk as Buffer);
				return Buffer.concat(chunks);
			};
			const webp = await read(first);
			const meta = await sharp(webp).metadata();
			expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
				'webp',
				2048,
				2048,
				true
			]);
			// The margins above and below the wide picture are transparent; the picture is not.
			const { data, info } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
			const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
			expect(alphaAt(1024, 10)).toBe(0);
			expect(alphaAt(1024, 2038)).toBe(0);
			expect(alphaAt(1024, 1024)).toBe(255);
			const thumb = await sharp(await read(thumbKeyOf(first))).metadata();
			expect([thumb.width, thumb.height]).toEqual([320, 320]);

			// A small picture is not enlarged.
			const second = await setTypePhoto(actor, type.id, await png(100, 60));
			expect(second).not.toBe(first);
			expect(await storage().get(first)).toBeNull();
			expect(await storage().get(thumbKeyOf(first))).toBeNull();
			expect((await sharp(await read(second)).metadata()).width).toBe(100);
			expect((await sharp(await read(thumbKeyOf(second))).metadata()).width).toBe(100);
			expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).photoKey).toBe(
				second
			);

			await removeTypePhoto(actor, type.id);
			expect(await storage().get(second)).toBeNull();
			expect(await storage().get(thumbKeyOf(second))).toBeNull();
		});

		it('keeps «Без фото» until a photo is set', async () => {
			const type = await createType(actor, { name: 'Провод', noPhoto: true });
			expect((await getType(actor, type.id)).noPhoto).toBe(true);
			await updateType(actor, type.id, { name: 'Провод USB' });
			expect((await getType(actor, type.id)).noPhoto).toBe(true);
			await setTypePhoto(actor, type.id, await png(100, 100));
			expect((await getType(actor, type.id)).noPhoto).toBe(false);
			await removeTypePhoto(actor, type.id);
			await updateType(actor, type.id, { noPhoto: true });
			expect((await getType(actor, type.id)).noPhoto).toBe(true);
		});

		it('rejects a picture over 50 megapixels before decoding it', async () => {
			const type = await createType(actor, { name: 'Нож' });
			await expect(setTypePhoto(actor, type.id, await png(8000, 8000))).rejects.toThrow(
				'мегапикселей'
			);
			await expect(setTypePhoto(actor, type.id, Buffer.from('not a picture'))).rejects.toThrow(
				'прочитать'
			);
		});

		it('serves the thumbnail, or the photo itself when an old photo has none', async () => {
			const type = await createType(actor, { name: 'Нож' });
			const fresh = await setTypePhoto(actor, type.id, await png(500, 500));
			expect((await openFile(actor, fresh, { thumb: true })).size).toBe(
				(await storage().get(thumbKeyOf(fresh)))!.size
			);
			await storage().put('types/old.webp', Buffer.from('old'), 'image/webp');
			await db.itemType.update({ where: { id: type.id }, data: { photoKey: 'types/old.webp' } });
			expect((await openFile(actor, 'types/old.webp', { thumb: true })).size).toBe(3);
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

		it('keeps a type linked through a parameter', async () => {
			const type = await createType(actor, { name: 'Блок питания' });
			const item = await createItem(actor, { newTypeName: 'Паяльник' });
			await setKeyedParams(actor, { itemId: item.id }, [
				{ key: 'зарядка', valueType: 'TYPE', refIds: [type.id], holder: 'ITEM' }
			]);
			await expect(deleteType(actor, type.id)).rejects.toThrow('уберите связи');
		});
	});
});
