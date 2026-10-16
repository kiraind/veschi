import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { createItem, moveItem } from './items';
import { suggestPlaces } from './places';

describe('suggestPlaces', () => {
	let actor: Actor;

	const box = (newTypeName: string, parentId: string | null = null) =>
		createItem(actor, { newTypeName, newTypeIsContainer: true, parentId });
	const thing = (newTypeName: string, parentId: string | null = null) =>
		createItem(actor, { newTypeName, parentId });
	const names = (list: { name: string }[]) => list.map((s) => s.name);

	beforeEach(async () => {
		actor = await createTestActor();
	});

	it('offers recent places first, newest first, and containers next to the item', async () => {
		const shelf = await box('Полка');
		const a = await box('Коробка А', shelf.id);
		const b = await box('Коробка Б', shelf.id);
		const drawer = await box('Ящик');
		const screw = await thing('Винт', a.id);
		const nut = await thing('Гайка', drawer.id);
		await moveItem(actor, nut.id, b.id);

		const found = await suggestPlaces(actor, screw.id);
		// Not the box it lies in; Б got something last, then the drawer, then the shelf.
		expect(names(found.recent)).toEqual(['Коробка Б', 'Ящик', 'Полка']);
		expect(found.recent[0]?.path.map((p) => p.name)).toEqual(['Полка']);
		expect(names(found.nearby)).toEqual([]);

		const forBox = await suggestPlaces(actor, a.id);
		// A container is not offered into itself or its own contents.
		expect(names(forBox.recent)).toEqual(['Коробка Б', 'Ящик']);
		expect(names(forBox.nearby)).toEqual([]);
	});

	it('offers neighbouring containers not in the recent list, by name', async () => {
		const shelf = await box('Полка');
		const item = await thing('Винт', shelf.id);
		await box('Органайзер', shelf.id);
		await box('Банка', shelf.id);
		await thing('Отвёртка', shelf.id);
		const found = await suggestPlaces(actor, item.id);
		expect(names(found.nearby)).toEqual(['Банка', 'Органайзер']);
		expect(names(found.recent)).not.toContain('Полка');
	});

	it('does not see other users’ places', async () => {
		const other = await createTestActor('other');
		await createItem(other, { newTypeName: 'Чужая коробка', newTypeIsContainer: true });
		const mine = await thing('Винт');
		const found = await suggestPlaces(actor, mine.id);
		expect([...found.recent, ...found.nearby]).toEqual([]);
		await expect(suggestPlaces(other, mine.id)).rejects.toThrow();
	});
});
