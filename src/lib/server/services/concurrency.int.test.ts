import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { discard } from './archive';
import { moveItem } from './items';
import { bindSticker } from './stickers';
import { consume, createWorkbench, take } from './workbench';

/** Parallel requests (a double tap, two devices) must not corrupt quantities or the tree. */
describe('parallel changes', () => {
	let actor: Actor;
	let typeId: string;
	let boxTypeId: string;

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'NE555' } })).id;
		boxTypeId = (
			await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Коробка', isContainer: true }
			})
		).id;
	});

	const box = (parentId: string | null = null) =>
		db.item.create({ data: { ownerId: actor.userId, typeId: boxTypeId, parentId } });
	const things = (quantity: number, parentId: string | null = null) =>
		db.item.create({ data: { ownerId: actor.userId, typeId, quantity, parentId } });
	const total = async () =>
		(
			await db.item.aggregate({
				where: { typeId, status: 'ACTIVE' },
				_sum: { quantity: true }
			})
		)._sum.quantity;

	it('two takes of a part keep the total', async () => {
		const bench = await createWorkbench(actor, { name: 'Стол' });
		const chips = await things(10, (await box()).id);
		await Promise.allSettled([
			take(actor, chips.id, { workbenchId: bench.id, quantity: 3 }),
			take(actor, chips.id, { workbenchId: bench.id, quantity: 3 })
		]);
		expect(await total()).toBe(10);
		expect((await db.item.findUniqueOrThrow({ where: { id: chips.id } })).quantity).toBe(4);
	});

	it('two «Использовать» subtract both', async () => {
		const chips = await things(10);
		await Promise.all([consume(actor, chips.id, 3), consume(actor, chips.id, 3)]);
		expect((await db.item.findUniqueOrThrow({ where: { id: chips.id } })).quantity).toBe(4);
	});

	it('two crossing moves cannot make a cycle', async () => {
		const [a, b] = [await box(), await box()];
		const results = await Promise.allSettled([
			moveItem(actor, a.id, b.id),
			moveItem(actor, b.id, a.id)
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const parents = await db.item.findMany({ where: { id: { in: [a.id, b.id] } } });
		expect(parents.filter((p) => p.parentId === null)).toHaveLength(1);
	});

	it('an item put into a box being discarded does not stay inside the archived box', async () => {
		const target = await box();
		const thing = await things(1);
		await Promise.allSettled([
			discard(actor, target.id, { contents: 'parent' }),
			moveItem(actor, thing.id, target.id)
		]);
		const after = await db.item.findUniqueOrThrow({ where: { id: thing.id } });
		expect(after.parentId).toBeNull();
	});

	it('one sticker is bound once', async () => {
		await db.sticker.create({ data: { ownerId: actor.userId, code: 'K7M4QX' } });
		const [a, b] = [await box(), await box()];
		const results = await Promise.allSettled([
			bindSticker(actor, 'K7M4QX', a.id),
			bindSticker(actor, 'K7M4QX', b.id)
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await db.historyEvent.count({ where: { kind: 'sticker.bound' } })).toBe(1);
	});
});
