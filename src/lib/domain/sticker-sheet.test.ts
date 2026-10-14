import { describe, expect, it } from 'vitest';
import {
	CAPTION_FONT_PT,
	CAPTION_MAX_LINES,
	ID_CAP_HEIGHT_EM,
	ID_GAP_MM,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	type StickerSpec,
	type StickerWidth,
	blankHeight,
	blanksPerSheet,
	captionWidthPt,
	columns,
	idFontMm,
	layoutSheets,
	parseCaptions,
	planSheets,
	qrSize,
	stickerHeight,
	stickerPadding,
	wrapCaption
} from './sticker-sheet';

const lineWidthPt = (qrSize(20) * 72) / 25.4;
const fitsLine = (line: string) => captionWidthPt(line) * CAPTION_FONT_PT <= lineWidthPt;

const blank = (n: number, width: StickerWidth = 20): StickerSpec[] =>
	Array.from({ length: n }, () => ({ width, caption: null }));
const captioned = (captions: string[], width: StickerWidth = 20) =>
	captions.map((caption) => ({ caption, width }));

describe('sticker sheet', () => {
	it('fits 10 columns of 20 mm on A4 with 5 mm side margins', () => {
		expect(MARGIN_X_MM).toBe(5);
		expect(blankHeight(20)).toBe(20);
		expect(blanksPerSheet(20)).toBe(140);
		const { cells, pages } = layoutSheets(blank(140));
		expect(pages).toBe(1);
		const last = cells[139]!;
		expect(last.x).toBe(PAGE_WIDTH_MM - 5 - 20);
		expect(last.y + last.height).toBeLessThanOrEqual(PAGE_HEIGHT_MM - MARGIN_Y_MM);
	});

	it('fits 5 columns of 40 mm, 35 to a sheet', () => {
		expect(columns(40)).toBe(5);
		expect(qrSize(40)).toBe(38);
		expect(blanksPerSheet(40)).toBe(35);
		const { cells, pages } = layoutSheets(blank(36, 40));
		expect(pages).toBe(2);
		expect(cells[4]).toMatchObject({ x: PAGE_WIDTH_MM - 5 - 40, width: 40, height: 40 });
		expect(cells[35]).toMatchObject({ page: 1, y: MARGIN_Y_MM });
	});

	it('makes every row as tall as its tallest sticker and continues on the next page', () => {
		const { cells, rows } = layoutSheets([
			{ width: 20, caption: 'по одной наклейке' },
			{ width: 20, caption: 'Припой' },
			...blank(9)
		]);
		expect(cells[0]).toEqual({
			index: 0,
			width: 20,
			page: 0,
			x: 5,
			y: MARGIN_Y_MM,
			height: stickerHeight(2)
		});
		expect(cells[9]?.height).toBe(stickerHeight(2));
		expect(cells[10]).toMatchObject({ x: 5, y: MARGIN_Y_MM + stickerHeight(2), height: 20 });
		expect(rows).toHaveLength(2);
		expect(layoutSheets(blank(141)).cells[140]).toMatchObject({ page: 1, y: MARGIN_Y_MM });
	});

	it('starts a new row when the width changes', () => {
		const { cells, rows } = layoutSheets([...blank(2, 40), ...blank(3)]);
		expect(rows.map((r) => [r.width, r.top])).toEqual([
			[40, MARGIN_Y_MM],
			[20, MARGIN_Y_MM + 40]
		]);
		expect(cells[2]).toMatchObject({ index: 2, x: 5, y: MARGIN_Y_MM + 40, width: 20 });
	});

	it('fits 20 columns of 10 × 10 mm, the ID under a QR of ≈7 mm', () => {
		expect(columns(10)).toBe(20);
		expect(blanksPerSheet(10)).toBe(560);
		expect(stickerPadding(10)).toBe(0.5);
		// Padding, QR, gap and the ID's cap height add up to the 10 mm square.
		const id = ID_CAP_HEIGHT_EM * idFontMm(10);
		expect(0.5 + qrSize(10) + ID_GAP_MM + id + 0.5).toBeCloseTo(10, 9);
		expect(qrSize(10)).toBeGreaterThan(7);
		// A 10 mm sticker never grows: it has no caption.
		const { cells } = layoutSheets([{ width: 10, caption: 'Коробка' }, ...blank(20, 10)]);
		expect(cells[0]).toMatchObject({ height: 10, width: 10 });
		expect(cells[20]).toMatchObject({ x: 5, y: MARGIN_Y_MM + 10 });
	});

	it('prints 10 mm stickers last and fills the sheet with them', () => {
		const plan = planSheets([{ caption: 'Коробка', width: 10 }], { 20: 1 });
		expect(plan.slots.slice(0, 11).map((s) => s.width)).toEqual([...Array(10).fill(20), 10]);
		// An ordered 10 mm sticker has no caption.
		expect(plan).toMatchObject({ captioned: 0, byWidth: { 20: 10 } });
		// A 20 mm row takes the place of two rows of 10 mm: 26 rows of 20 are left.
		expect(plan.byWidth[10]).toBe(26 * 20);
		expect(planSheets([], { 10: 560 })).toMatchObject({ sheets: 1, padding: 0 });
		expect(planSheets([], { 10: 560 * 20 + 1 }).sheets).toBe(21);
	});

	it('wraps 40 mm captions into wider lines', () => {
		const text = 'Коробка с микросхемами';
		expect(wrapCaption(text, 20).lines.length).toBeGreaterThan(1);
		expect(wrapCaption(text, 40)).toEqual({ lines: [text], truncated: false });
		expect(stickerHeight(1, 40)).toBeGreaterThan(40);
	});

	it('7 captions + 10 blank → 1 sheet, filled up with blank stickers', () => {
		const captions = ['Припой', 'Шкаф', 'Полка 1', 'Полка 2', 'Коробка', 'Ящик', 'Пакет'];
		// A row of 7 captioned + 3 blank, then 12 rows of blank ones.
		const plan = planSheets(captioned(captions), { 20: 10 });
		expect(plan).toMatchObject({ sheets: 1, total: 130, captioned: 7, padding: 113 });
		expect(plan.slots.slice(0, 8).map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, null]);
	});

	it('puts 40 mm stickers first and fills the rest with 20 mm ones', () => {
		const plan = planSheets(
			[
				{ caption: 'Припой', width: 20 },
				{ caption: 'Шуруповёрт', width: 40 }
			],
			{ 20: 1, 40: 1 }
		);
		expect(plan.slots.slice(0, 7)).toEqual([
			{ index: 1, width: 40 },
			{ index: null, width: 40 },
			{ index: null, width: 40 },
			{ index: null, width: 40 },
			{ index: null, width: 40 },
			{ index: 0, width: 20 },
			{ index: null, width: 20 }
		]);
		// A captioned 40 mm row (≈43 mm) leaves room for 11 rows of 20 mm.
		expect(plan).toMatchObject({ sheets: 1, total: 5 + 110, byWidth: { 10: 0, 20: 110, 40: 5 } });
		expect(planSheets([], { 40: 1 }, false)).toMatchObject({ total: 1, padding: 0 });
		// Only 40 mm: the sheet is filled with 40 mm ones.
		expect(planSheets([], { 40: 1 })).toMatchObject({ total: 35, byWidth: { 40: 35 } });
	});

	it('0 captions + 141 blank → 2 sheets of 140', () => {
		expect(planSheets([], { 20: 141 })).toMatchObject({
			sheets: 2,
			total: 280,
			captioned: 0,
			padding: 139
		});
	});

	it('without filling the sheet, prints only what was asked', () => {
		expect(planSheets(captioned(['Припой']), { 20: 141 }, false)).toMatchObject({
			sheets: 2,
			total: 142,
			captioned: 1,
			padding: 0
		});
	});

	it('exactly one sheet needs no padding; nothing requested → no sheets', () => {
		expect(planSheets([], { 20: 140 })).toMatchObject({ sheets: 1, padding: 0 });
		expect(planSheets([], { 40: 35 })).toMatchObject({ sheets: 1, padding: 0 });
		expect(planSheets([], {})).toMatchObject({ sheets: 0, total: 0 });
	});

	it('does not lay out batches that are too big anyway', () => {
		expect(planSheets([], { 20: 1e9 })).toMatchObject({ slots: [] });
		expect(planSheets([], { 20: 1e9 }).sheets).toBeGreaterThan(20);
		expect(planSheets([], { 40: 35 * 20 + 1 }).sheets).toBe(21);
	});

	it('parses one caption per non-empty line', () => {
		expect(parseCaptions(' Припой \n\n  \nОтвёртки\r\n')).toEqual(['Припой', 'Отвёртки']);
	});

	it('wraps captions by words, and the sticker grows with the lines', () => {
		expect(wrapCaption('Припой')).toEqual({ lines: ['Припой'], truncated: false });
		expect(wrapCaption('по одной наклейке')).toEqual({
			lines: ['по одной', 'наклейке'],
			truncated: false
		});
		expect(stickerHeight(0)).toBe(20);
		expect(stickerHeight(1)).toBeGreaterThan(20);
		expect(stickerHeight(2)).toBeGreaterThan(stickerHeight(1));
	});

	it('breaks words longer than a line', () => {
		const { lines, truncated } = wrapCaption('Электролитические');
		expect(truncated).toBe(false);
		expect(lines.join('')).toBe('Электролитические');
		expect(lines.length).toBe(2);
		lines.forEach((line) => expect(fitsLine(line)).toBe(true));
	});

	it('cuts what does not fit into the lines, ending with «…»', () => {
		for (const caption of [
			'Ш'.repeat(60),
			'Коробка с микросхемами, резисторами и конденсаторами'
		]) {
			const { lines, truncated } = wrapCaption(caption);
			expect(truncated).toBe(true);
			expect(lines).toHaveLength(CAPTION_MAX_LINES);
			expect(lines.at(-1)?.endsWith('…')).toBe(true);
			lines.forEach((line) => expect(fitsLine(line)).toBe(true));
		}
	});

	it('measures unknown characters as the widest ones', () => {
		expect(captionWidthPt('🙂')).toBeGreaterThanOrEqual(captionWidthPt('Ш'));
	});
});
