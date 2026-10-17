import { describe, expect, it } from 'vitest';
import {
	foldYo,
	likePattern,
	looseText,
	parseSearchQuery,
	searchKey,
	searchPlaceholder
} from './search';

describe('parseSearchQuery', () => {
	it('keeps plain text', () => {
		expect(parseSearchQuery('  NE555  ')).toEqual({ text: 'NE555', param: null });
	});

	it('splits «ключ: значение»', () => {
		expect(parseSearchQuery('корпус: DIP-8')).toEqual({
			text: 'корпус: DIP-8',
			param: { key: 'корпус', value: 'DIP-8' }
		});
	});

	it('does not treat URLs or a dangling colon as a key', () => {
		expect(parseSearchQuery('https://example.com').param).toBeNull();
		expect(parseSearchQuery('корпус:').param).toBeNull();
	});
});

describe('parseSearchQuery numbers', () => {
	it('reads numbers as the app shows them', () => {
		expect(parseSearchQuery('\u221240').text).toBe('-40');
		expect(parseSearchQuery('4\u202f500 мкФ').text).toBe('4500 мкФ');
		expect(parseSearchQuery('1\u202f000\u202f000').text).toBe('1000000');
		expect(parseSearchQuery('M3 100').text).toBe('M3 100');
	});
});

describe('likePattern', () => {
	it('escapes wildcards', () => {
		expect(likePattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
	});
});

describe('searchPlaceholder', () => {
	it('falls back to built-in examples when the user has none', () => {
		expect(searchPlaceholder([], [])).toBe('NE555 или «корпус: DIP-8»');
	});

	it('takes the user’s own short names and parameters', () => {
		const names = ['Кабель USB-C — USB-C 2 м с поддержкой 100 Вт', 'Паяльник'];
		const params = [
			{ key: 'описание', value: 'очень длинное значение параметра' },
			{ key: 'цвет', value: 'белый' }
		];
		expect(searchPlaceholder(names, params, () => 0)).toBe('Паяльник или «цвет: белый»');
	});

	it('skips keys with a colon: they would not parse back', () => {
		expect(searchPlaceholder([], [{ key: 'a:b', value: 'c' }])).toContain('«корпус: DIP-8»');
	});
});

describe('looseText', () => {
	it('drops spaces, hyphens and dots from part codes', () => {
		for (const s of ['DIP-8', 'DIP 8', 'dip8', 'DIP.8', 'DIP\u20138']) {
			expect(looseText(s).toUpperCase()).toBe('DIP8');
		}
		expect(looseText('ne 555')).toBe('ne555');
		expect(looseText('Т.  С. - 2')).toBe('ТС2');
	});

	it('keeps a decimal point between digits', () => {
		expect(looseText('1.5 мм')).toBe('1.5мм');
		expect(looseText('v.1.5.')).toBe('v1.5');
	});
});

describe('foldYo and searchKey', () => {
	it('reads ё as е, keeping the case', () => {
		expect(foldYo('Ёлка, ёж и ЕЖ')).toBe('Елка, еж и ЕЖ');
	});

	it('makes «ёлка» and «Елка» the same filter text', () => {
		expect(searchKey('  ЁЛКА ')).toBe('елка');
		expect(searchKey('Ёлочная игрушка').includes(searchKey('елоч'))).toBe(true);
		expect(searchKey('Елочная игрушка').includes(searchKey('Ёлоч'))).toBe(true);
	});
});
