import { describe, expect, it } from 'vitest';
import {
	autoHyphenateDate,
	daysInMonth,
	formatIsoDate,
	formatIsoDateTime,
	monthGrid,
	normalizeDateInput,
	parseIsoDate,
	shiftMonth
} from './dates';

describe('dates', () => {
	it('formats a moment as local ISO date and date-time', () => {
		const d = new Date(2026, 0, 5, 9, 7); // local time
		expect(formatIsoDate(d)).toBe('2026-01-05');
		expect(formatIsoDateTime(d)).toBe('2026-01-05 09:07');
		expect(formatIsoDateTime(d.toISOString())).toBe('2026-01-05 09:07');
		// Late evening stays on the same local day.
		expect(formatIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
	});

	it('parses strict ISO dates', () => {
		expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
		expect(parseIsoDate('2026-02-29')).toBeNull();
		expect(parseIsoDate('2026-13-01')).toBeNull();
		expect(parseIsoDate('2026-1-5')).toBeNull();
		expect(parseIsoDate('')).toBeNull();
	});

	it('normalizes typed dates', () => {
		expect(normalizeDateInput('  ')).toBe('');
		expect(normalizeDateInput('2026-10-10')).toBe('2026-10-10');
		expect(normalizeDateInput('2026-1-5')).toBe('2026-01-05');
		expect(normalizeDateInput('2026.01.05')).toBe('2026-01-05');
		expect(normalizeDateInput('05.01.2026')).toBe('2026-01-05');
		expect(normalizeDateInput('5.1.2026')).toBe('2026-01-05');
		expect(normalizeDateInput('01/05/2026')).toBeNull(); // ambiguous US/UK
		expect(normalizeDateInput('2026-02-30')).toBeNull();
		expect(normalizeDateInput('завтра')).toBeNull();
	});

	it('builds a Monday-first month grid', () => {
		// 2026-10-01 is a Thursday → three blanks.
		const oct = monthGrid(2026, 10);
		expect(oct.slice(0, 4)).toEqual([null, null, null, 1]);
		expect(oct.at(-1)).toBe(31);
		// 2026-06-01 is a Monday → no blanks.
		expect(monthGrid(2026, 6)[0]).toBe(1);
		// 2026-03-01 is a Sunday → six blanks.
		expect(monthGrid(2026, 3).indexOf(1)).toBe(6);
		expect(daysInMonth(2024, 2)).toBe(29);
	});

	it('shifts months across years', () => {
		expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
		expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
		expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
	});

	describe('autoHyphenateDate', () => {
		// Types `chars` one by one at the end of the field, as a keyboard does.
		const type = (chars: string, start = '') => {
			let text = start;
			for (const ch of chars) {
				text = autoHyphenateDate(text, text + ch, text.length + 1, 'insertText').text;
			}
			return text;
		};

		it('inserts hyphens while digits are typed', () => {
			expect(type('2026')).toBe('2026-');
			expect(type('202610')).toBe('2026-10-');
			expect(type('20261025')).toBe('2026-10-25');
			expect(type('202610251')).toBe('2026-10-25');
		});

		it('does not double a hyphen the user types too', () => {
			expect(type('2026-10-25')).toBe('2026-10-25');
		});

		it('lets a hyphen end a short month or day', () => {
			expect(type('2026-1-5')).toBe('2026-1-5');
		});

		it('formats pasted digits', () => {
			expect(autoHyphenateDate('', '20261025', 8, 'insertFromPaste')).toEqual({
				text: '2026-10-25',
				caret: 10
			});
		});

		it('leaves other formats alone', () => {
			expect(autoHyphenateDate('25.10.202', '25.10.2026', 10, 'insertText').text).toBe(
				'25.10.2026'
			);
			expect(autoHyphenateDate('2026/10/2', '2026/10/25', 10, 'insertText').text).toBe(
				'2026/10/25'
			);
		});

		it('does not add the hyphen back on Backspace at the end', () => {
			expect(autoHyphenateDate('2026-10-', '2026-10', 7, 'deleteContentBackward')).toEqual({
				text: '2026-10',
				caret: 7
			});
			expect(autoHyphenateDate('2026-', '2026', 4, 'deleteContentBackward').text).toBe('2026');
		});

		it('removes the digit before a hyphen erased inside the date', () => {
			expect(autoHyphenateDate('2026-10-25', '2026-1025', 7, 'deleteContentBackward')).toEqual({
				text: '2026-12-5',
				caret: 6
			});
		});

		it('removes the digit after a hyphen erased with Delete', () => {
			expect(autoHyphenateDate('2026-10-25', '202610-25', 4, 'deleteContentForward')).toEqual({
				text: '2026-0-25',
				caret: 4
			});
		});

		it('keeps the caret after the same digit when editing inside', () => {
			// «2026-1|-25» + «1» → «2026-11-25», caret after the new digit.
			expect(autoHyphenateDate('2026-1-25', '2026-11-25', 7, 'insertText')).toEqual({
				text: '2026-11-25',
				caret: 7
			});
			// Erasing a digit in the month shifts the rest left.
			expect(autoHyphenateDate('2026-10-25', '2026-1-25', 6, 'deleteContentBackward')).toEqual({
				text: '2026-1-25',
				caret: 6
			});
		});
	});
});
