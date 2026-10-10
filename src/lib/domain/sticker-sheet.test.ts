import { describe, expect, it } from 'vitest';
import {
	BLANK_HEIGHT_MM,
	BLANKS_PER_SHEET,
	CAPTION_FONT_PT,
	CAPTION_MAX_LINES,
	CAPTION_WIDTH_MM,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	captionWidthPt,
	layoutSheets,
	parseCaptions,
	planSheets,
	stickerHeight,
	wrapCaption
} from './sticker-sheet';

const lineWidthPt = (CAPTION_WIDTH_MM * 72) / 25.4;
const fitsLine = (line: string) => captionWidthPt(line) * CAPTION_FONT_PT <= lineWidthPt;

describe('sticker sheet', () => {
	it('fits 10 columns of 20 mm on A4 with 5 mm side margins', () => {
		expect(MARGIN_X_MM).toBe(5);
		expect(BLANK_HEIGHT_MM).toBe(20);
		expect(BLANKS_PER_SHEET).toBe(140);
		const { cells, pages } = layoutSheets(Array<number>(140).fill(BLANK_HEIGHT_MM));
		expect(pages).toBe(1);
		const last = cells[139]!;
		expect(last.x).toBe(PAGE_WIDTH_MM - 5 - 20);
		expect(last.y + last.height).toBeLessThanOrEqual(PAGE_HEIGHT_MM - MARGIN_Y_MM);
	});

	it('makes every row as tall as its tallest sticker and continues on the next page', () => {
		const heights = [stickerHeight(2), stickerHeight(1), ...Array<number>(8).fill(BLANK_HEIGHT_MM)];
		const { cells, rowEdges } = layoutSheets([...heights, BLANK_HEIGHT_MM]);
		expect(cells[0]).toEqual({ page: 0, x: 5, y: MARGIN_Y_MM, height: stickerHeight(2) });
		expect(cells[9]?.height).toBe(stickerHeight(2));
		expect(cells[10]).toEqual({
			page: 0,
			x: 5,
			y: MARGIN_Y_MM + stickerHeight(2),
			height: BLANK_HEIGHT_MM
		});
		expect(rowEdges[0]).toHaveLength(2);
		expect(layoutSheets(Array<number>(141).fill(BLANK_HEIGHT_MM)).cells[140]).toMatchObject({
			page: 1,
			y: MARGIN_Y_MM
		});
	});

	it('7 captions + 10 blank → 1 sheet, filled up with blank stickers', () => {
		const captions = ['Припой', 'Шкаф', 'Полка 1', 'Полка 2', 'Коробка', 'Ящик', 'Пакет'];
		// A row of 7 captioned + 3 blank, then 12 rows of blank ones.
		expect(planSheets(captions, 10)).toEqual({
			sheets: 1,
			total: 130,
			captioned: 7,
			padding: 113
		});
	});

	it('0 captions + 141 blank → 2 sheets of 140', () => {
		expect(planSheets([], 141)).toEqual({ sheets: 2, total: 280, captioned: 0, padding: 139 });
	});

	it('exactly one sheet needs no padding; nothing requested → no sheets', () => {
		expect(planSheets([], 140)).toMatchObject({ sheets: 1, padding: 0 });
		expect(planSheets([], 0)).toMatchObject({ sheets: 0, total: 0 });
	});

	it('does not lay out batches that are too big anyway', () => {
		expect(planSheets([], 1e9).sheets).toBeGreaterThan(20);
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
		expect(stickerHeight(0)).toBe(BLANK_HEIGHT_MM);
		expect(stickerHeight(1)).toBeGreaterThan(BLANK_HEIGHT_MM);
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
