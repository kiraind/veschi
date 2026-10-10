import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { defIdFor } from '$lib/server/testing/params';
import { discard, listArchive, purge, restore } from './archive';
import { createWorkbench, listWorkbench, take } from './workbench';

describe('archive service', () => {
	let actor: Actor;
	let typeId: string;
	const codes = ['ABC234', 'ABC345', 'ABC456'];
	let codeCounter = 0;

	async function item(name: string, parentId: string | null = null) {
		return db.item.create({
			data: { ownerId: actor.userId, typeId, name, parentId, isContainer: true }
		});
	}

	async function stickerFor(itemId: string) {
		const code = codes[codeCounter++ % codes.length]!;
		return db.sticker.create({ data: { ownerId: actor.userId, code, status: 'BOUND', itemId } });
	}

	const reload = (id: string) => db.item.findUniqueOrThrow({ where: { id } });
	const sticker = (id: string) => db.sticker.findUniqueOrThrow({ where: { id } });

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Вещь' } })).id;
	});

	it('discards a box by default: contents where the box was, box archived, sticker written off', async () => {
		const shelf = await item('Полка');
		const box = await item('Коробка', shelf.id);
		const chip = await item('NE555', box.id);
		const boxSticker = await stickerFor(box.id);
		const chipSticker = await stickerFor(chip.id);

		await discard(actor, box.id);

		expect(await reload(box.id)).toMatchObject({ status: 'ARCHIVED', parentId: shelf.id });
		expect((await reload(box.id)).archivedAt).toBeInstanceOf(Date);
		expect(await reload(chip.id)).toMatchObject({ status: 'ACTIVE', parentId: shelf.id });
		expect(await sticker(boxSticker.id)).toMatchObject({ status: 'WRITTEN_OFF', itemId: box.id });
		expect((await sticker(chipSticker.id)).status).toBe('BOUND');
	});

	it('restores: active again and the sticker bound again', async () => {
		const shelf = await item('Полка');
		const knife = await item('Нож', shelf.id);
		const s = await stickerFor(knife.id);
		await discard(actor, knife.id);
		await restore(actor, knife.id);
		expect(await reload(knife.id)).toMatchObject({
			status: 'ACTIVE',
			archivedAt: null,
			parentId: shelf.id
		});
		expect(await sticker(s.id)).toMatchObject({ status: 'BOUND', itemId: knife.id });
	});

	it('restores to the top level when the old container is archived', async () => {
		const shelf = await item('Полка');
		const knife = await item('Нож', shelf.id);
		await discard(actor, knife.id);
		await discard(actor, shelf.id);
		await restore(actor, knife.id);
		expect(await reload(knife.id)).toMatchObject({ status: 'ACTIVE', parentId: null });
	});

	it('discards contents together and restores them together', async () => {
		const box = await item('Коробка');
		const inner = await item('Пакет', box.id);
		const chip = await item('NE555', inner.id);
		const s = await stickerFor(chip.id);
		await discard(actor, box.id, { contents: 'discard' });
		for (const id of [box.id, inner.id, chip.id]) {
			expect((await reload(id)).status).toBe('ARCHIVED');
		}
		expect((await sticker(s.id)).status).toBe('WRITTEN_OFF');

		await restore(actor, box.id);
		for (const id of [box.id, inner.id, chip.id]) {
			expect((await reload(id)).status).toBe('ACTIVE');
		}
		expect(await reload(chip.id)).toMatchObject({ parentId: inner.id });
		expect((await sticker(s.id)).status).toBe('BOUND');
	});

	it('moves contents to a workbench as taken items with the container’s home', async () => {
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		const shelf = await item('Полка');
		const box = await item('Коробка', shelf.id);
		const chip = await item('NE555', box.id);
		await discard(actor, box.id, { contents: 'workbench', workbenchId: bench.id });
		expect(await reload(chip.id)).toMatchObject({
			parentId: bench.id,
			takenById: actor.userId,
			homeId: shelf.id
		});
		expect((await listWorkbench(actor)).map((i) => i.id)).toEqual([chip.id]);
		await expect(discard(actor, shelf.id, { contents: 'workbench' })).rejects.toThrow('стол');
	});

	it('keeps contents of a container discarded on a bench on that bench', async () => {
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		const shelf = await item('Полка');
		const box = await item('Коробка', shelf.id);
		const chip = await item('NE555', box.id);
		await take(actor, box.id, { workbenchId: bench.id });
		await discard(actor, box.id);
		expect(await reload(chip.id)).toMatchObject({
			parentId: bench.id,
			takenById: actor.userId,
			homeId: shelf.id
		});
	});

	it('rejects discarding twice and restoring an active item', async () => {
		const knife = await item('Нож');
		await expect(restore(actor, knife.id)).rejects.toThrow('не в архиве');
		await discard(actor, knife.id);
		await expect(discard(actor, knife.id)).rejects.toThrow('уже в архиве');
	});

	it('purges an archived item with its archived subtree; stickers stay written off', async () => {
		const box = await item('Коробка');
		const chip = await item('NE555', box.id);
		const s = await stickerFor(box.id);
		const other = await item('Другая');
		await db.param.create({
			data: {
				itemId: other.id,
				defId: await defIdFor(actor, 'Ссылка', 'REF'),
				valueType: 'REF',
				refItemId: box.id
			}
		});

		await expect(purge(actor, box.id)).rejects.toThrow('только вещь из архива');
		await discard(actor, box.id, { contents: 'discard' });
		await purge(actor, box.id);

		expect(await db.item.findMany({ where: { id: { in: [box.id, chip.id] } } })).toEqual([]);
		expect(await sticker(s.id)).toMatchObject({ status: 'WRITTEN_OFF', itemId: null });
		expect((await reload(other.id)).id).toBe(other.id);
	});

	it('keeps param refs to archived items', async () => {
		const box = await item('Коробка');
		const other = await item('Другая');
		const param = await db.param.create({
			data: {
				itemId: other.id,
				defId: await defIdFor(actor, 'Ссылка', 'REF'),
				valueType: 'REF',
				refItemId: box.id
			}
		});
		await discard(actor, box.id);
		expect((await db.param.findUniqueOrThrow({ where: { id: param.id } })).refItemId).toBe(box.id);
	});

	it('lists archived items with paths, newest first, only the actor’s', async () => {
		const shelf = await item('Полка');
		const knife = await item('Нож', shelf.id);
		const fork = await item('Вилка');
		await discard(actor, knife.id);
		await discard(actor, fork.id);
		const list = await listArchive(actor);
		expect(list.map((i) => i.name)).toEqual(['Вилка', 'Нож']);
		expect(list[1]?.path.map((n) => n.name)).toEqual(['Полка']);
		expect(list[1]?.archivedAt).toBeInstanceOf(Date);

		const other = await createTestActor('other');
		expect(await listArchive(other)).toEqual([]);
		await expect(restore(other, knife.id)).rejects.toThrow('не найдена');
	});
});
