import { describe, expect, it } from 'vitest';
import {
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
});
