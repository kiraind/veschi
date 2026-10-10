import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { assertCanPlace, getPath, getPaths } from './paths';

describe('paths', () => {
	let actor: Actor;
	let typeId: string;

	async function item(name: string, parentId: string | null = null) {
		return db.item.create({
			data: { ownerId: actor.userId, typeId, name, parentId, isContainer: true }
		});
	}

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Коробка' } })).id;
	});

	it('returns the full path from the top level', async () => {
		const shelf = await item('Шкаф');
		const level = await item('Полка 2', shelf.id);
		const box = await item('', level.id);
		const chip = await item('NE555', box.id);
		expect((await getPath(chip.id)).map((n) => n.name)).toEqual(['Шкаф', 'Полка 2', 'Коробка']);
		const paths = await getPaths([shelf.id, level.id]);
		expect(paths.get(shelf.id)).toEqual([]);
		expect(paths.get(level.id)?.map((n) => n.id)).toEqual([shelf.id]);
	});

	it('rejects cycles', async () => {
		const outer = await item('Внешняя');
		const inner = await item('Внутренняя', outer.id);
		await expect(assertCanPlace(outer.id, outer.id)).rejects.toThrow();
		await expect(assertCanPlace(outer.id, inner.id)).rejects.toThrow();
		await expect(assertCanPlace(inner.id, null)).resolves.toBeUndefined();
	});
});
