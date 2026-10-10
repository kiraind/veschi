import { describe, expect, it } from 'vitest';
import {
	CAPTION_FONT_PT,
	CAPTION_MIN_FONT_PT,
	CAPTION_WIDTH_MM,
	captionWidthPt,
	fitCaption,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	STICKERS_PER_SHEET,
	cellPosition,
	parseCaptions,
	planSheets
} from './sticker-sheet';

describe('sticker sheet', () => {
	it('fits 6 × 9 cells of 33 × 31 mm on A4 with 6 mm side margins', () => {
		expect(STICKERS_PER_SHEET).toBe(54);
		expect(MARGIN_X_MM).toBe(6);
		expect(MARGIN_Y_MM).toBe(9);
		const last = cellPosition(53);
		expect(last).toEqual({ page: 0, x: PAGE_WIDTH_MM - 6 - 33, y: PAGE_HEIGHT_MM - 9 - 31 });
	});

	it('7 captions + 10 blank → 1 sheet of 54 stickers', () => {
		expect(planSheets(7, 10)).toEqual({ sheets: 1, total: 54, captioned: 7, padding: 37 });
	});

	it('0 captions + 60 blank → 2 sheets of 108 stickers', () => {
		expect(planSheets(0, 60)).toEqual({ sheets: 2, total: 108, captioned: 0, padding: 48 });
	});

	it('exactly one sheet needs no padding; nothing requested → no sheets', () => {
		expect(planSheets(54, 0)).toMatchObject({ sheets: 1, padding: 0 });
		expect(planSheets(0, 0)).toMatchObject({ sheets: 0, total: 0 });
	});

	it('places stickers row by row and continues on the next page', () => {
		expect(cellPosition(0)).toEqual({ page: 0, x: 6, y: 9 });
		expect(cellPosition(1)).toEqual({ page: 0, x: 39, y: 9 });
		expect(cellPosition(6)).toEqual({ page: 0, x: 6, y: 40 });
		expect(cellPosition(54)).toEqual({ page: 1, x: 6, y: 9 });
	});

	it('parses one caption per non-empty line', () => {
		expect(parseCaptions(' Припой \n\n  \nОтвёртки\r\n')).toEqual(['Припой', 'Отвёртки']);
	});

	it('keeps captions that fit, shrinking the font before cutting', () => {
		expect(fitCaption('Припой')).toEqual({
			text: 'Припой',
			fontSize: CAPTION_FONT_PT,
			truncated: false
		});
		// 17 characters used to be cut to «по одной наклей…»; now it fits as is.
		expect(fitCaption('по одной наклейке')).toMatchObject({
			text: 'по одной наклейке',
			truncated: false
		});
		const smaller = fitCaption('Шуруповёрт Makita DF333');
		expect(smaller.text).toBe('Шуруповёрт Makita DF333');
		expect(smaller.fontSize).toBeLessThan(CAPTION_FONT_PT);
		expect(smaller.fontSize).toBeGreaterThanOrEqual(CAPTION_MIN_FONT_PT);
	});

	it('cuts by width only at the smallest size, filling the line', () => {
		const width = (CAPTION_WIDTH_MM * 72) / 25.4;
		for (const caption of [
			'Ш'.repeat(40),
			'i'.repeat(200),
			'Коробка с микросхемами и резисторами'
		]) {
			const fitted = fitCaption(caption);
			expect(fitted.truncated).toBe(true);
			expect(fitted.fontSize).toBe(CAPTION_MIN_FONT_PT);
			expect(fitted.text.endsWith('…')).toBe(true);
			const used = captionWidthPt(fitted.text) * CAPTION_MIN_FONT_PT;
			expect(used).toBeLessThanOrEqual(width);
			// One more character would not fit.
			const next = [...caption][[...fitted.text].length - 1] ?? '';
			expect(used + captionWidthPt(next) * CAPTION_MIN_FONT_PT).toBeGreaterThan(width);
		}
	});

	it('measures unknown characters as the widest ones', () => {
		expect(captionWidthPt('🙂')).toBeGreaterThanOrEqual(captionWidthPt('Ш'));
	});
});
