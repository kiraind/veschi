import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { MIN_CODE_DISTANCE, formatCode, hammingDistance } from '$lib/domain/sticker-code';
import {
	bindSticker,
	cancelStickerOrder,
	getBatchPdf,
	issueBatch,
	listBatches,
	listStickerOrders,
	orderSticker,
	resolveCode,
	restoreStickerOf,
	unbindSticker,
	unprintBatch,
	writeOffStickerOf
} from './stickers';

describe('stickers', () => {
	let actor: Actor;
	let typeId: string;

	async function item(name: string) {
		return db.item.create({ data: { ownerId: actor.userId, typeId, name } });
	}

	async function batchStickers(batchId: string) {
		return db.sticker.findMany({ where: { batchId }, orderBy: { position: 'asc' } });
	}

	async function freeSticker(caption: string | null = null) {
		const batch = await issueBatch(actor, { captions: caption ? [caption] : [], blankCount: 1 });
		const [sticker] = await batchStickers(batch.id);
		if (!sticker) throw new Error('no sticker issued');
		return sticker;
	}

	beforeEach(async () => {
		actor = await createTestActor();
		typeId = (await db.itemType.create({ data: { ownerId: actor.userId, name: 'Припой' } })).id;
	});

	describe('issueBatch (FR-9, FR-11)', () => {
		it('7 captions + 10 blank → one sheet of 130 stickers, 7 captioned', async () => {
			const captions = ['Припой', 'Шкаф', 'Полка 1', 'Полка 2', 'Коробка', 'Ящик', 'Пакет'];
			const batch = await issueBatch(actor, { captions, blankCount: 10 });
			expect(batch).toMatchObject({ total: 130, captioned: 7, free: 130 });
			const stickers = await batchStickers(batch.id);
			expect(stickers).toHaveLength(130);
			expect(stickers.slice(0, 7).map((s) => s.caption)).toEqual(captions);
			expect(stickers.slice(7).every((s) => s.caption === null)).toBe(true);
		});

		it('0 captions + 141 blank → two sheets, 280 stickers', async () => {
			const batch = await issueBatch(actor, { captions: [], blankCount: 141 });
			expect(batch.total).toBe(280);
			expect(await db.sticker.count({ where: { batchId: batch.id } })).toBe(280);
		});

		it('issues new, unique, free codes far from every code issued before, by anyone', async () => {
			const other = await createTestActor('other');
			await issueBatch(other, { captions: [], blankCount: 140 });
			await issueBatch(actor, { captions: [], blankCount: 140 });
			await issueBatch(actor, { captions: [' ', ''], blankCount: 200 });
			const all = await db.sticker.findMany();
			expect(all).toHaveLength(140 * 4);
			expect(all.every((s) => s.status === 'FREE' && /^[2-9A-HJKMNP-Z]{6}$/.test(s.code))).toBe(
				true
			);
			all.forEach((a, i) => {
				for (const b of all.slice(i + 1)) {
					expect(hammingDistance(a.code, b.code)).toBeGreaterThanOrEqual(MIN_CODE_DISTANCE);
				}
			});
		});

		it('rejects empty and oversized batches', async () => {
			await expect(issueBatch(actor, { captions: ['  '], blankCount: 0 })).rejects.toThrow(
				'хотя бы одна'
			);
			await expect(issueBatch(actor, { captions: [], blankCount: -1 })).rejects.toThrow();
			await expect(issueBatch(actor, { captions: [], blankCount: 140 * 20 + 1 })).rejects.toThrow(
				'не больше'
			);
		});
	});

	it('lists own batches with counts by status', async () => {
		const other = await createTestActor('other');
		await issueBatch(other, { captions: [], blankCount: 1 });
		const batch = await issueBatch(actor, { captions: ['Припой'], blankCount: 0 });
		const [first, second] = await batchStickers(batch.id);
		if (!first || !second) throw new Error('no stickers issued');
		const a = await item('A');
		const b = await item('B');
		await bindSticker(actor, first.code, a.id);
		await bindSticker(actor, second.code, b.id);
		await unbindSticker(actor, b.id);
		const list = await listBatches(actor);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			id: batch.id,
			total: 130,
			captioned: 1,
			free: 128,
			bound: 1,
			writtenOff: 1
		});
	});

	it('renders the batch PDF with one page per sheet; other users cannot get it', async () => {
		const batch = await issueBatch(actor, { captions: ['Припой'], blankCount: 140 });
		const { filename, pdf } = await getBatchPdf(actor, batch.id, 'https://v.ex.io');
		expect(filename).toMatch(/^stickers-\d{4}-\d{2}-\d{2}-[0-9a-z]{8}\.pdf$/);
		expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
		const other = await createTestActor('other');
		await expect(getBatchPdf(other, batch.id, 'https://v.ex.io')).rejects.toThrow('не найдена');
		await expect(getBatchPdf(actor, 'nope', 'https://v.ex.io')).rejects.toThrow('не найдена');
	});

	describe('resolveCode and binding (FR-1, FR-2, FR-12)', () => {
		it('free sticker with a caption → free with caption; after binding → bound to the item', async () => {
			const sticker = await freeSticker('Припой');
			expect(await resolveCode(actor, sticker.code)).toEqual({
				status: 'free',
				code: sticker.code,
				caption: 'Припой'
			});
			const solder = await item('Припой');
			await bindSticker(actor, sticker.code, solder.id);
			expect(await resolveCode(actor, sticker.code)).toEqual({
				status: 'bound',
				code: sticker.code,
				caption: 'Припой',
				itemId: solder.id
			});
		});

		it('any case and dash placement, or a sticker URL, resolve to the same item', async () => {
			const sticker = await freeSticker();
			const box = await item('Коробка');
			await bindSticker(actor, sticker.code.toLowerCase(), box.id);
			const display = formatCode(sticker.code);
			for (const input of [
				sticker.code,
				sticker.code.toLowerCase(),
				display,
				display.toLowerCase(),
				`HTTPS://V.EX.IO/${sticker.code}`
			]) {
				expect(await resolveCode(actor, input)).toMatchObject({ status: 'bound', itemId: box.id });
			}
		});

		it('unknown ID → unknown, with a suggestion when one character differs', async () => {
			const sticker = await freeSticker();
			const typo = (sticker.code[0] === '2' ? '3' : '2') + sticker.code.slice(1);
			expect(await resolveCode(actor, typo)).toEqual({
				status: 'unknown',
				code: typo,
				suggestion: formatCode(sticker.code)
			});
			const far = sticker.code
				.split('')
				.map((c) => (c === 'Z' ? 'Y' : 'Z'))
				.join('');
			expect(await resolveCode(actor, far)).toEqual({ status: 'unknown', code: far });
			expect(await resolveCode(actor, 'garbage')).toEqual({ status: 'unknown' });
		});

		it("does not reveal or suggest other users' stickers", async () => {
			const other = await createTestActor('other');
			const batch = await issueBatch(other, { captions: [], blankCount: 1 });
			const [sticker] = await batchStickers(batch.id);
			if (!sticker) throw new Error('no sticker issued');
			expect(await resolveCode(actor, sticker.code)).toEqual({
				status: 'unknown',
				code: sticker.code
			});
			const box = await item('Коробка');
			await expect(bindSticker(actor, sticker.code, box.id)).rejects.toThrow('Такой наклейки нет');
		});

		it('an item without a sticker can get a free one, but not a second one', async () => {
			const box = await item('Коробка');
			const first = await freeSticker();
			const second = await freeSticker();
			await bindSticker(actor, first.code, box.id);
			await expect(bindSticker(actor, second.code, box.id)).rejects.toThrow('уже есть наклейка');
			const other = await item('Другая');
			await expect(bindSticker(actor, first.code, other.id)).rejects.toThrow('уже использована');
			await expect(bindSticker(actor, 'K7M4Q0', other.id)).rejects.toThrow('Некорректный');
		});

		it('splits one thing off a record of several and sticks the sticker on it', async () => {
			const shelf = await db.itemType.create({
				data: { ownerId: actor.userId, name: 'Полка', isContainer: true }
			});
			const place = await db.item.create({ data: { ownerId: actor.userId, typeId: shelf.id } });
			const several = await db.item.create({
				data: { ownerId: actor.userId, typeId, name: 'ПОС-61', quantity: 3, parentId: place.id }
			});
			const def = await db.paramDef.create({
				data: { ownerId: actor.userId, name: 'Диаметр', valueType: 'NUMBER' }
			});
			await db.param.create({
				data: { defId: def.id, itemId: several.id, valueType: 'NUMBER', numberValue: 1 }
			});
			const sticker = await freeSticker();

			const { itemId } = await bindSticker(actor, sticker.code, several.id);
			expect(itemId).not.toBe(several.id);
			expect(await db.item.findUniqueOrThrow({ where: { id: several.id } })).toMatchObject({
				quantity: 2
			});
			expect(await db.item.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
				quantity: 1,
				name: 'ПОС-61',
				typeId,
				parentId: place.id
			});
			expect(await db.param.findFirst({ where: { itemId } })).toMatchObject({ numberValue: 1 });
			expect(await resolveCode(actor, sticker.code)).toMatchObject({ status: 'bound', itemId });

			// A single thing keeps its record.
			const single = await item('Одна');
			const another = await freeSticker();
			expect(await bindSticker(actor, another.code, single.id)).toEqual({ itemId: single.id });
		});

		it('binds only to own active items', async () => {
			const sticker = await freeSticker();
			const archived = await db.item.create({
				data: { ownerId: actor.userId, typeId, status: 'ARCHIVED' }
			});
			await expect(bindSticker(actor, sticker.code, archived.id)).rejects.toThrow('не найдена');
			const other = await createTestActor('other');
			const foreign = await db.item.create({ data: { ownerId: other.userId, typeId } });
			await expect(bindSticker(actor, sticker.code, foreign.id)).rejects.toThrow('не найдена');
		});
	});

	describe('write-off', () => {
		it('archiving writes the sticker off (link to the archived item kept); restoring re-binds it', async () => {
			const sticker = await freeSticker();
			const box = await item('Коробка');
			await bindSticker(actor, sticker.code, box.id);
			await writeOffStickerOf([box.id]);
			expect(await resolveCode(actor, sticker.code)).toMatchObject({
				status: 'written_off',
				itemId: box.id
			});
			await restoreStickerOf([box.id]);
			expect(await resolveCode(actor, sticker.code)).toMatchObject({
				status: 'bound',
				itemId: box.id
			});
		});

		it('detaching a damaged sticker writes it off for good and frees the item for a new one', async () => {
			const damaged = await freeSticker();
			const box = await item('Коробка');
			await bindSticker(actor, damaged.code, box.id);
			await unbindSticker(actor, box.id);
			expect(await resolveCode(actor, damaged.code)).toEqual({
				status: 'written_off',
				code: damaged.code,
				caption: null
			});
			await restoreStickerOf([box.id]);
			expect(await resolveCode(actor, damaged.code)).toMatchObject({ status: 'written_off' });
			const fresh = await freeSticker();
			await bindSticker(actor, fresh.code, box.id);
			await expect(unbindSticker(actor, (await item('Без')).id)).rejects.toThrow('нет наклейки');
		});
	});

	describe('orders («Заказать наклейку»)', () => {
		async function events(subjectId: string) {
			return (
				await db.historyEvent.findMany({ where: { subjectId }, orderBy: { createdAt: 'asc' } })
			).map((e) => e.kind);
		}

		it('orders, lists and cancels; ordering twice changes nothing', async () => {
			const box = await item('Коробка');
			await orderSticker(actor, box.id);
			await orderSticker(actor, box.id);
			expect(await listStickerOrders(actor)).toMatchObject([
				{ itemId: box.id, caption: 'Коробка', quantity: 1 }
			]);
			expect(await listStickerOrders(await createTestActor('other'))).toEqual([]);
			await cancelStickerOrder(actor, box.id);
			await cancelStickerOrder(actor, box.id);
			expect(await listStickerOrders(actor)).toEqual([]);
			expect(await events(box.id)).toEqual(['sticker.ordered', 'sticker.orderCancelled']);
		});

		it('refuses items with a sticker, archived items and other users’ items', async () => {
			const box = await item('Коробка');
			await bindSticker(actor, (await freeSticker()).code, box.id);
			await expect(orderSticker(actor, box.id)).rejects.toThrow('уже есть наклейка');
			const old = await db.item.create({
				data: { ownerId: actor.userId, typeId, name: 'Старое', status: 'ARCHIVED' }
			});
			await expect(orderSticker(actor, old.id)).rejects.toThrow('не найдена');
			const other = await createTestActor('other');
			await expect(orderSticker(other, (await item('Чужое')).id)).rejects.toThrow('не найдена');
		});

		it('binding a sticker by hand fulfils the order', async () => {
			const box = await item('Коробка');
			await orderSticker(actor, box.id);
			await bindSticker(actor, (await freeSticker()).code, box.id);
			expect(await listStickerOrders(actor)).toEqual([]);
		});

		it('the next batch prints ordered stickers first, with the name, bound to the item', async () => {
			const box = await item('Коробка');
			const solder = await db.item.create({
				data: { ownerId: actor.userId, typeId, quantity: 3 }
			});
			await orderSticker(actor, box.id);
			await orderSticker(actor, solder.id);
			const batch = await issueBatch(actor, {
				captions: ['Полка'],
				blankCount: 0,
				orderItemIds: [box.id, solder.id]
			});
			expect(batch).toMatchObject({ total: 130, captioned: 3, ordered: 2, bound: 2, free: 128 });
			const [first, second, third] = await batchStickers(batch.id);
			expect(first).toMatchObject({ caption: 'Коробка', status: 'BOUND', itemId: box.id });
			expect(second).toMatchObject({ caption: 'Припой', status: 'BOUND', fromOrder: true });
			expect(third).toMatchObject({ caption: 'Полка', status: 'FREE', itemId: null });
			// A sticker marks one thing: one of three solders got its own record.
			expect(second!.itemId).not.toBe(solder.id);
			expect(await db.item.findUnique({ where: { id: solder.id } })).toMatchObject({
				quantity: 2,
				stickerOrderedAt: null
			});
			expect(await listStickerOrders(actor)).toEqual([]);
			expect(await listBatches(actor)).toMatchObject([{ ordered: 2, bound: 2 }]);
			expect(await events(box.id)).toEqual(['sticker.ordered', 'sticker.printed']);
		});

		it('refuses a batch when the orders changed since the page was loaded', async () => {
			const box = await item('Коробка');
			await expect(
				issueBatch(actor, { captions: [], blankCount: 0, orderItemIds: [box.id] })
			).rejects.toThrow('обновите страницу');
			expect(await db.stickerBatch.count()).toBe(0);
		});
	});

	describe('unprintBatch («Не распечатано»)', () => {
		it('deletes the batch and its stickers, so the IDs are free again', async () => {
			const batch = await issueBatch(actor, { captions: ['Припой'], blankCount: 0 });
			const [first] = await batchStickers(batch.id);
			await unprintBatch(actor, batch.id);
			expect(await db.stickerBatch.count()).toBe(0);
			expect(await db.sticker.count()).toBe(0);
			expect(await resolveCode(actor, first!.code)).toMatchObject({ status: 'unknown' });
			expect(await listBatches(actor)).toEqual([]);
			expect(
				await db.historyEvent.findFirst({ where: { kind: 'stickers.unprinted' } })
			).toMatchObject({
				subjectId: batch.id,
				data: { count: 130 }
			});
		});

		it('ordered items get their orders back', async () => {
			const box = await item('Коробка');
			await orderSticker(actor, box.id);
			const batch = await issueBatch(actor, {
				captions: [],
				blankCount: 0,
				orderItemIds: [box.id]
			});
			await unprintBatch(actor, batch.id);
			expect(await listStickerOrders(actor)).toMatchObject([{ itemId: box.id }]);
			expect(await getItemSticker(box.id)).toBeNull();
			const event = await db.historyEvent.findFirst({ where: { kind: 'stickers.unprinted' } });
			expect(event).toMatchObject({ data: { count: 130, ordered: 1 }, refIds: [box.id] });
		});

		it('refuses once a sticker of the batch is in use; other users cannot touch it', async () => {
			const batch = await issueBatch(actor, { captions: [], blankCount: 1 });
			const [first] = await batchStickers(batch.id);
			const box = await item('Коробка');
			await bindSticker(actor, first!.code, box.id);
			await expect(unprintBatch(actor, batch.id)).rejects.toThrow('уже используются');
			await unbindSticker(actor, box.id);
			await expect(unprintBatch(actor, batch.id)).rejects.toThrow('уже используются');
			const other = await createTestActor('other');
			await expect(unprintBatch(other, batch.id)).rejects.toThrow('не найдена');
			expect(await db.sticker.count({ where: { batchId: batch.id } })).toBe(140);
		});
	});

	async function getItemSticker(itemId: string) {
		return db.sticker.findUnique({ where: { itemId } });
	}
});
