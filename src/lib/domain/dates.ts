/**
 * Dates are shown everywhere as ISO: «2026-10-10», with time «2026-10-10 14:05»
 * (local time). Date-only values (params) are kept as 'YYYY-MM-DD' strings and
 * handled as year/month/day numbers, never via `new Date('YYYY-MM-DD')` (that is
 * UTC midnight and shifts the day in western time zones).
 */

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export interface DateParts {
	year: number;
	/** 1–12. */
	month: number;
	day: number;
}

export function daysInMonth(year: number, month: number): number {
	// Day 0 of the next month is the last day of this one; local-time constructor, no TZ shift.
	return new Date(year, month, 0).getDate();
}

export function isoFromParts({ year, month, day }: DateParts): string {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Strict 'YYYY-MM-DD' with a real calendar day → parts, otherwise null. */
export function parseIsoDate(s: string): DateParts | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return null;
	return validParts(Number(m[1]), Number(m[2]), Number(m[3]));
}

function validParts(year: number, month: number, day: number): DateParts | null {
	if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
		return null;
	}
	return { year, month, day };
}

/**
 * Typed date → 'YYYY-MM-DD'; '' for an empty field; null if not a date.
 * Accepts ISO with 1–2 digit month/day and «.» or «/» separators (2026-1-5,
 * 2026.01.05) and the Russian «05.01.2026».
 */
export function normalizeDateInput(text: string): string | null {
	const s = text.trim();
	if (!s) return '';
	let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
	if (m) return partsOrNull(Number(m[1]), Number(m[2]), Number(m[3]));
	m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
	if (m) return partsOrNull(Number(m[3]), Number(m[2]), Number(m[1]));
	return null;
}

function partsOrNull(year: number, month: number, day: number): string | null {
	const parts = validParts(year, month, day);
	return parts ? isoFromParts(parts) : null;
}

const SEGMENT_LENGTHS = [4, 2, 2];

/**
 * Hyphens typed for the user in a date field: «20261025» → «2026-10-25».
 * `before` is the field before the edit, `text` and `caret` after it;
 * `inputType` is `InputEvent.inputType`. Only text of digits and hyphens is
 * touched, so «25.10.2026» and «2026/10/25» stay as typed. A digit past a full
 * part starts the next one, a typed hyphen ends a part early (2026-1-5), a full
 * year or month gets its hyphen at once while typing at the end. Backspace or
 * Delete on a hyphen inside the date removes the digit next to it too, since the
 * hyphen alone would come right back.
 */
export function autoHyphenateDate(
	before: string,
	text: string,
	caret: number,
	inputType: string
): { text: string; caret: number } {
	if (!/^[\d-]*$/.test(text)) return { text, caret };
	const deleting = inputType.startsWith('delete');
	if (deleting && before.length === text.length + 1 && caret < text.length) {
		if (before[caret] === '-' && before.slice(0, caret) + before.slice(caret + 1) === text) {
			if (inputType === 'deleteContentForward') {
				text = text.slice(0, caret) + text.slice(caret + 1);
			} else if (caret > 0) {
				text = text.slice(0, caret - 1) + text.slice(caret);
				caret -= 1;
			}
		}
	}
	const atEnd = caret >= text.length;
	const digitsBeforeCaret = text.slice(0, caret).replace(/-/g, '').length;

	// Parts closed by a hyphen, then the one being typed.
	const parts: string[] = [];
	let part = '';
	const partLength = () => SEGMENT_LENGTHS[parts.length] ?? 0;
	const isLastPart = () => parts.length === SEGMENT_LENGTHS.length - 1;
	for (const ch of text) {
		if (ch === '-') {
			if (part && !isLastPart()) {
				parts.push(part);
				part = '';
			}
		} else if (part.length < partLength()) {
			part += ch;
		} else if (!isLastPart()) {
			parts.push(part);
			part = ch;
		}
	}
	if (!deleting && atEnd && !isLastPart() && part.length === partLength()) {
		parts.push(part);
		part = '';
	}
	parts.push(part);
	const result = parts.join('-');
	if (atEnd) return { text: result, caret: result.length };
	let pos = 0;
	for (let digits = 0; pos < result.length && digits < digitsBeforeCaret; pos++) {
		if (result[pos] !== '-') digits++;
	}
	return { text: result, caret: pos };
}

/** Local calendar date of a moment: «2026-10-10». */
export function formatIsoDate(d: Date | string | number): string {
	const date = d instanceof Date ? d : new Date(d);
	return isoFromParts({
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate()
	});
}

/** Local date and time of a moment: «2026-10-10 14:05». */
export function formatIsoDateTime(d: Date | string | number): string {
	const date = d instanceof Date ? d : new Date(d);
	return `${formatIsoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const MONTH_NAMES = [
	'Январь',
	'Февраль',
	'Март',
	'Апрель',
	'Май',
	'Июнь',
	'Июль',
	'Август',
	'Сентябрь',
	'Октябрь',
	'Ноябрь',
	'Декабрь'
] as const;

/** Monday first. */
export const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/**
 * Calendar grid of a month, Monday first: null for the blank cells before the
 * 1st, then the day numbers 1…n.
 */
export function monthGrid(year: number, month: number): (number | null)[] {
	const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
	const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
	return [...Array<null>(offset).fill(null), ...days];
}

export function shiftMonth(
	year: number,
	month: number,
	delta: number
): { year: number; month: number } {
	const index = year * 12 + (month - 1) + delta;
	return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
