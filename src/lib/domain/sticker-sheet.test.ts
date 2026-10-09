import { describe, expect, it } from 'vitest';
import {
	CAPTION_MAX_LENGTH,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	STICKERS_PER_SHEET,
	cellPosition,
	isCaptionTooLong,
	parseCaptions,
	planSheets,
	truncateCaption
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

	it('warns about and truncates long captions', () => {
		const exact = 'Ж'.repeat(CAPTION_MAX_LENGTH);
		expect(isCaptionTooLong(exact)).toBe(false);
		expect(truncateCaption(exact)).toBe(exact);
		const long = 'Коробка с микросхемами';
		expect(isCaptionTooLong(long)).toBe(true);
		expect(truncateCaption(long)).toBe('Коробка с микро…');
		expect([...truncateCaption(long)]).toHaveLength(CAPTION_MAX_LENGTH);
	});
});
