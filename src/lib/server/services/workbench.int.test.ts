import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { discard } from './archive';
import { getPath } from './paths';
import {
	consume,
	createWorkbench,
	deleteWorkbench,
	listWorkbench,
	listWorkbenches,
	relocate,
	returnHome,
	take,
	updateWorkbench
} from './workbench';

describe('workbench service', () => {
	let actor: Actor;
	let typeId: string;
	let containerTypeId: string;
	let garage: string;

	/** Single items are of a container type (so things can go in); several are plain things. */
	async function item(name: string, parentId: string | null = null, quantity = 1) {
		return db.item.create({
			data: {
				ownerId: actor.userId,
				typeId: quantity === 1 ? containerTypeId : typeId,
				name,
				parentId,
				quantity
			}
		});
	}

	const reload = (id: string) => db.item.findUniqueOrThrow({ where: { id } });

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Вещь' } })).id;
		containerTypeId = (
			await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Ёмкость', isContainer: true }
			})
		).id;
		garage = (await createWorkbench(actor, { name: 'Гараж' })).id;
	});

	describe('workbench CRUD', () => {
		it('creates, updates and lists benches with an optional geofence', async () => {
			const home = await createWorkbench(actor, {
				name: ' Дом ',
				geoLat: 55.75,
				geoLng: 37.6,
				geoRadiusM: 100
			});
			expect(home.name).toBe('Дом');
			await updateWorkbench(actor, home.id, { name: 'Квартира' });
			const { workbenches, lastWorkbenchId } = await listWorkbenches(actor);
			expect(workbenches.map((b) => [b.name, b.geoRadiusM])).toEqual([
				['Гараж', null],
				['Квартира', null]
			]);
			expect(lastWorkbenchId).toBeNull();
		});

		it('validates the name and the geofence', async () => {
			await expect(createWorkbench(actor, { name: '  ' })).rejects.toThrow('название');
			await expect(createWorkbench(actor, { name: 'X', geoLat: 1 })).rejects.toThrow('зоны');
			await expect(
				createWorkbench(actor, { name: 'X', geoLat: 1, geoLng: 1, geoRadiusM: 0 })
			).rejects.toThrow('Радиус');
		});

		it('rejects deleting a bench with items on it', async () => {
			const knife = await item('Нож');
			await take(actor, knife.id, { workbenchId: garage });
			await expect(deleteWorkbench(actor, garage)).rejects.toThrow('На столе есть вещи');
			await relocate(actor, knife.id, null);
			await deleteWorkbench(actor, garage);
			expect((await listWorkbenches(actor)).workbenches).toEqual([]);
		});

		it('hides other users’ benches', async () => {
			const other = await createTestActor('other');
			expect((await listWorkbenches(other)).workbenches).toEqual([]);
			await expect(deleteWorkbench(other, garage)).rejects.toThrow('не найден');
		});
	});

	it('takes a knife: on the bench with its home and who took it', async () => {
		const drawer = await item('Ящик');
		const knife = await item('Нож', drawer.id);
		await take(actor, knife.id, { workbenchId: garage });

		const taken = await reload(knife.id);
		expect(taken).toMatchObject({ parentId: garage, homeId: drawer.id, takenById: actor.userId });
		expect(taken.takenAt).toBeInstanceOf(Date);
		expect((await listWorkbenches(actor)).lastWorkbenchId).toBe(garage);

		const [listed] = await listWorkbench(actor, garage);
		expect(listed).toMatchObject({
			id: knife.id,
			name: 'Нож',
			workbenchId: garage,
			takenByName: 'tester',
			canReturn: true
		});
		expect(listed?.homePath.map((n) => n.name)).toEqual(['Ящик']);
	});

	it('shows the sticker codes of the containers on the way home', async () => {
		const shelf = await item('Стеллаж');
		const drawer = await item('Ящик', shelf.id);
		const knife = await item('Нож', drawer.id);
		await db.sticker.create({
			data: { ownerId: actor.userId, code: 'K7M4QX', status: 'BOUND', itemId: shelf.id }
		});
		await take(actor, knife.id, { workbenchId: garage });

		const [listed] = await listWorkbench(actor, garage);
		expect(listed?.homePath.map((n) => [n.name, n.stickerCode])).toEqual([
			['Стеллаж', 'K7M4QX'],
			['Ящик', null]
		]);
	});

	describe('taking part of the quantity', () => {
		let box: { id: string };
		let chips: { id: string };

		beforeEach(async () => {
			box = await item('Коробка');
			chips = await item('NE555', box.id, 10);
			await db.sticker.create({
				data: { ownerId: actor.userId, code: 'K7M4QX', status: 'BOUND', itemId: chips.id }
			});
			const def = await db.paramDef.create({
				data: { ownerId: actor.userId, name: 'Корпус', valueType: 'STRING' }
			});
			await db.param.create({
				data: { defId: def.id, itemId: chips.id, valueType: 'STRING', textValue: 'DIP-8' }
			});
		});

		it('takes 2 of 10: the box keeps 8 with the sticker, the bench gets a new record of 2', async () => {
			const { itemId } = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			expect(itemId).not.toBe(chips.id);
			expect(await reload(chips.id)).toMatchObject({
				quantity: 8,
				parentId: box.id,
				takenById: null
			});
			const part = await db.item.findUniqueOrThrow({
				where: { id: itemId },
				include: { sticker: true, params: true }
			});
			expect(part).toMatchObject({
				quantity: 2,
				name: 'NE555',
				typeId,
				splitFromId: chips.id,
				parentId: garage,
				homeId: box.id
			});
			expect(part.sticker).toBeNull();
			expect(part.params).toMatchObject([{ valueType: 'STRING', textValue: 'DIP-8' }]);
			expect(await db.param.count({ where: { itemId: chips.id } })).toBe(1);
		});

		it('takes two parts to the same bench as one record', async () => {
			const first = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			const second = await take(actor, chips.id, { workbenchId: garage, quantity: 3 });
			expect(second.itemId).toBe(first.itemId);
			expect(await reload(first.itemId)).toMatchObject({
				quantity: 5,
				parentId: garage,
				homeId: box.id,
				splitFromId: chips.id
			});
			expect(await reload(chips.id)).toMatchObject({ quantity: 5, parentId: box.id });
			expect((await listWorkbench(actor)).map((i) => [i.id, i.quantity])).toEqual([
				[first.itemId, 5]
			]);
			// Everything merges back into the source.
			expect(await returnHome(actor, first.itemId)).toEqual({ itemId: chips.id, merged: true });
			expect(await reload(chips.id)).toMatchObject({ quantity: 10 });
		});

		it('keeps parts taken to different benches apart', async () => {
			const home = (await createWorkbench(actor, { name: 'Дом' })).id;
			const a = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			const b = await take(actor, chips.id, { workbenchId: home, quantity: 3 });
			expect(b.itemId).not.toBe(a.itemId);
			expect(await reload(a.itemId)).toMatchObject({ quantity: 2, parentId: garage });
			expect(await reload(b.itemId)).toMatchObject({ quantity: 3, parentId: home });
		});

		it('returns those 2: one record of 10 in the box, the bench is empty', async () => {
			const { itemId } = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			const result = await returnHome(actor, itemId);
			expect(result).toEqual({ itemId: chips.id, merged: true });
			expect(await reload(chips.id)).toMatchObject({ quantity: 10, parentId: box.id });
			expect(await db.item.findUnique({ where: { id: itemId } })).toBeNull();
			expect(await listWorkbench(actor)).toEqual([]);
		});

		it('returns as a separate record when the source moved away', async () => {
			const { itemId } = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			await db.item.update({ where: { id: chips.id }, data: { parentId: null } });
			expect(await returnHome(actor, itemId)).toEqual({ itemId, merged: false });
			expect(await reload(itemId)).toMatchObject({
				parentId: box.id,
				quantity: 2,
				takenById: null,
				homeId: null,
				splitFromId: null
			});
		});

		it('uses 2 of 2 on the bench: the record is archived, the box keeps 8', async () => {
			const { itemId } = await take(actor, chips.id, { workbenchId: garage, quantity: 2 });
			expect(await consume(actor, itemId, 2)).toEqual({ archived: true });
			expect(await reload(itemId)).toMatchObject({ status: 'ARCHIVED', quantity: 2 });
			expect(await reload(chips.id)).toMatchObject({ quantity: 8, status: 'ACTIVE' });
			expect(await listWorkbench(actor)).toEqual([]);
		});

		it('rejects quantities out of range', async () => {
			await expect(take(actor, chips.id, { workbenchId: garage, quantity: 11 })).rejects.toThrow(
				'не больше 10'
			);
			await expect(consume(actor, chips.id, 0)).rejects.toThrow();
		});

		describe('putting away part of what is on the bench', () => {
			let onBench: string;

			beforeEach(async () => {
				onBench = (await take(actor, chips.id, { workbenchId: garage, quantity: 4 })).itemId;
			});

			it('returns 1 of 4: merges into the box, 3 stay on the bench still taken', async () => {
				expect(await returnHome(actor, onBench, { quantity: 1 })).toEqual({
					itemId: chips.id,
					merged: true
				});
				expect(await reload(chips.id)).toMatchObject({ quantity: 7, parentId: box.id });
				expect(await reload(onBench)).toMatchObject({
					quantity: 3,
					parentId: garage,
					homeId: box.id,
					splitFromId: chips.id,
					takenById: actor.userId
				});
				// The rest still merges back later.
				await returnHome(actor, onBench);
				expect(await reload(chips.id)).toMatchObject({ quantity: 10 });
			});

			it('returns 1 of 4 as a new record in the box when the source moved away', async () => {
				await db.item.update({ where: { id: chips.id }, data: { parentId: null } });
				const { itemId, merged } = await returnHome(actor, onBench, { quantity: 1 });
				expect(merged).toBe(false);
				expect(itemId).not.toBe(onBench);
				expect(await reload(itemId)).toMatchObject({
					quantity: 1,
					parentId: box.id,
					typeId,
					name: 'NE555',
					takenById: null,
					homeId: null,
					splitFromId: null
				});
				expect(await reload(onBench)).toMatchObject({ quantity: 3, parentId: garage });
				expect(await reload(chips.id)).toMatchObject({ quantity: 6, parentId: null });
			});

			it('relocates 3 of 4 into a drawer: a new untaken record, 1 stays on the bench', async () => {
				const drawer = await item('Ящик');
				const { itemId } = await relocate(actor, onBench, drawer.id, { quantity: 3 });
				expect(itemId).not.toBe(onBench);
				expect(await reload(itemId)).toMatchObject({
					quantity: 3,
					parentId: drawer.id,
					takenById: null,
					takenAt: null,
					homeId: null,
					splitFromId: null
				});
				expect(await reload(onBench)).toMatchObject({
					quantity: 1,
					parentId: garage,
					homeId: box.id,
					takenById: actor.userId
				});
				expect((await listWorkbench(actor)).map((i) => [i.id, i.quantity])).toEqual([[onBench, 1]]);
			});

			it('relocates into a drawer that has the same thing: adds to it', async () => {
				const drawer = await item('Ящик');
				const first = await relocate(actor, onBench, drawer.id, { quantity: 1 });
				const twin = await reload(first.itemId);
				expect(twin).toMatchObject({ quantity: 1, parentId: drawer.id, splitFromId: null });
				// A part merges into the record already there…
				expect(await relocate(actor, onBench, drawer.id, { quantity: 2 })).toEqual({
					itemId: twin.id
				});
				expect(await reload(twin.id)).toMatchObject({ quantity: 3 });
				expect(await reload(onBench)).toMatchObject({ quantity: 1, parentId: garage });
				// …and so does the whole rest, whose record disappears.
				expect(await relocate(actor, onBench, drawer.id)).toEqual({ itemId: twin.id });
				expect(await reload(twin.id)).toMatchObject({ quantity: 4, takenById: null });
				expect(await db.item.findUnique({ where: { id: onBench } })).toBeNull();
				expect(await listWorkbench(actor)).toEqual([]);
				expect(await db.item.count({ where: { parentId: drawer.id } })).toBe(1);
				expect(await db.param.count({ where: { itemId: twin.id } })).toBe(1);
			});

			it('returns into the home next to an identical record when the source moved away', async () => {
				await db.item.update({ where: { id: chips.id }, data: { parentId: null } });
				const first = await returnHome(actor, onBench, { quantity: 1 });
				expect(first.merged).toBe(false);
				const second = await returnHome(actor, onBench, { quantity: 2 });
				expect(second).toEqual({ itemId: first.itemId, merged: false });
				expect(await reload(first.itemId)).toMatchObject({ quantity: 3, parentId: box.id });
				expect(await reload(onBench)).toMatchObject({ quantity: 1, parentId: garage });
			});

			it('relocates all 4 as the record itself', async () => {
				expect(await relocate(actor, onBench, null, { quantity: 4 })).toEqual({ itemId: onBench });
				expect(await reload(onBench)).toMatchObject({ parentId: null, takenById: null });
			});

			it('rejects parts out of range', async () => {
				await expect(returnHome(actor, onBench, { quantity: 5 })).rejects.toThrow('не больше 4');
				await expect(relocate(actor, onBench, null, { quantity: 0 })).rejects.toThrow(
					'целое число'
				);
				expect(await reload(onBench)).toMatchObject({ quantity: 4, parentId: garage });
			});
		});
	});

	it('uses part of the quantity without archiving', async () => {
		const screws = await item('Винты', null, 5);
		expect(await consume(actor, screws.id, 3)).toEqual({ archived: false });
		expect(await reload(screws.id)).toMatchObject({ quantity: 2, status: 'ACTIVE' });
	});

	it('takes a box: its contents stay in it and their path starts with the bench', async () => {
		const shelf = await item('Полка');
		const box = await item('Коробка', shelf.id);
		const chip = await item('NE555', box.id);
		await take(actor, box.id, { workbenchId: garage });
		expect((await reload(chip.id)).parentId).toBe(box.id);
		const path = await getPath(chip.id);
		expect(path.map((n) => [n.name, n.isWorkbench])).toEqual([
			['Гараж', true],
			['Коробка', false]
		]);
		const [listed] = await listWorkbench(actor);
		expect(listed).toMatchObject({ id: box.id, hasChildren: true });
	});

	it('moves an item between benches keeping its original home', async () => {
		const home = (await createWorkbench(actor, { name: 'Дом' })).id;
		const drawer = await item('Ящик');
		const knife = await item('Нож', drawer.id);
		await take(actor, knife.id, { workbenchId: garage });
		await take(actor, knife.id, { workbenchId: home });
		expect(await reload(knife.id)).toMatchObject({ parentId: home, homeId: drawer.id });
		expect(await listWorkbench(actor, garage)).toEqual([]);
		expect((await listWorkbenches(actor)).lastWorkbenchId).toBe(home);
	});

	it('returns an item taken from the top level to the top level', async () => {
		const knife = await item('Нож');
		await take(actor, knife.id, { workbenchId: garage });
		expect((await listWorkbench(actor))[0]?.homePath).toEqual([]);
		await returnHome(actor, knife.id);
		expect(await reload(knife.id)).toMatchObject({ parentId: null, takenById: null });
	});

	it('relocates into another container and forgets the home', async () => {
		const drawer = await item('Ящик');
		const toolbox = await item('Ящик с инструментами');
		const knife = await item('Нож', drawer.id);
		await take(actor, knife.id, { workbenchId: garage });
		await relocate(actor, knife.id, toolbox.id);
		expect(await reload(knife.id)).toMatchObject({
			parentId: toolbox.id,
			homeId: null,
			takenById: null,
			takenAt: null
		});
		await expect(relocate(actor, toolbox.id, toolbox.id)).rejects.toThrow('саму себя');
		await expect(relocate(actor, knife.id, garage)).rejects.toThrow('На стол');
	});

	describe('return is unavailable', () => {
		it('when the home is archived', async () => {
			const drawer = await item('Ящик');
			const knife = await item('Нож', drawer.id);
			await take(actor, knife.id, { workbenchId: garage });
			await discard(actor, drawer.id);
			const [listed] = await listWorkbench(actor);
			expect(listed).toMatchObject({
				canReturn: false,
				returnBlockedReason: 'Исходное место в архиве'
			});
			await expect(returnHome(actor, knife.id)).rejects.toThrow('в архиве');
		});

		it('when the home is itself on a bench', async () => {
			const box = await item('Коробка');
			const chip = await item('NE555', box.id);
			await take(actor, chip.id, { workbenchId: garage });
			await take(actor, box.id, { workbenchId: garage });
			const listed = (await listWorkbench(actor)).find((i) => i.id === chip.id);
			expect(listed?.canReturn).toBe(false);
			await expect(returnHome(actor, chip.id)).rejects.toThrow('на рабочем столе');
		});
	});

	it('rejects returning an item that is not on a bench', async () => {
		const knife = await item('Нож');
		await expect(returnHome(actor, knife.id)).rejects.toThrow('не на рабочем столе');
	});
});

describe('workbench icons', () => {
	let actor: Actor;

	beforeEach(async () => {
		actor = await createTestActor();
	});

	it('creates a bench without an icon (default) and with one', async () => {
		const plain = await createWorkbench(actor, { name: 'Кабинет' });
		expect(plain.icon).toBeNull();
		const garage = await createWorkbench(actor, { name: 'Гараж', icon: 'garage' });
		expect(garage.icon).toBe('garage');
		const { workbenches } = await listWorkbenches(actor);
		expect(workbenches.map((b) => b.icon)).toEqual([null, 'garage']);
	});

	it('changes the icon on update, keeps it when omitted, resets it with null', async () => {
		const bench = await createWorkbench(actor, { name: 'Гараж', icon: 'garage' });
		expect((await updateWorkbench(actor, bench.id, { name: 'Гараж', icon: 'tools' })).icon).toBe(
			'tools'
		);
		expect((await updateWorkbench(actor, bench.id, { name: 'Мастерская' })).icon).toBe('tools');
		expect((await updateWorkbench(actor, bench.id, { name: 'Гараж', icon: null })).icon).toBeNull();
	});

	it('rejects an unknown icon key', async () => {
		await expect(createWorkbench(actor, { name: 'Гараж', icon: 'rocket' })).rejects.toThrow(
			'Неизвестная иконка'
		);
		const bench = await createWorkbench(actor, { name: 'Гараж' });
		await expect(updateWorkbench(actor, bench.id, { name: 'Гараж', icon: '' })).rejects.toThrow(
			'Неизвестная иконка'
		);
		expect((await db.item.findUniqueOrThrow({ where: { id: bench.id } })).icon).toBeNull();
	});
});
