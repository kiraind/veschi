import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { MIN_CODE_DISTANCE, formatCode, hammingDistance } from '$lib/domain/sticker-code';
import {
	bindSticker,
	getBatchPdf,
	issueBatch,
	listBatches,
	resolveCode,
	restoreStickerOf,
	unbindSticker,
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
		it('7 captions + 10 blank → one sheet of 54 stickers, 7 captioned', async () => {
			const captions = ['Припой', 'Шкаф', 'Полка 1', 'Полка 2', 'Коробка', 'Ящик', 'Пакет'];
			const batch = await issueBatch(actor, { captions, blankCount: 10 });
			expect(batch).toMatchObject({ total: 54, captioned: 7, free: 54 });
			const stickers = await batchStickers(batch.id);
			expect(stickers).toHaveLength(54);
			expect(stickers.slice(0, 7).map((s) => s.caption)).toEqual(captions);
			expect(stickers.slice(7).every((s) => s.caption === null)).toBe(true);
		});

		it('0 captions + 60 blank → two sheets, 108 stickers', async () => {
			const batch = await issueBatch(actor, { captions: [], blankCount: 60 });
			expect(batch.total).toBe(108);
			expect(await db.sticker.count({ where: { batchId: batch.id } })).toBe(108);
		});

		it('issues new, unique, free codes far from every code issued before, by anyone', async () => {
			const other = await createTestActor('other');
			await issueBatch(other, { captions: [], blankCount: 54 });
			await issueBatch(actor, { captions: [], blankCount: 54 });
			await issueBatch(actor, { captions: [' ', ''], blankCount: 100 });
			const all = await db.sticker.findMany();
			expect(all).toHaveLength(54 * 4);
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
			await expect(issueBatch(actor, { captions: [], blankCount: 54 * 20 + 1 })).rejects.toThrow(
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
			total: 54,
			captioned: 1,
			free: 52,
			bound: 1,
			writtenOff: 1
		});
	});

	it('renders the batch PDF with one page per sheet; other users cannot get it', async () => {
		const batch = await issueBatch(actor, { captions: ['Припой'], blankCount: 60 });
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
});
