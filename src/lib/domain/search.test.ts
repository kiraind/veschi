import { describe, expect, it } from 'vitest';
import { likePattern, parseSearchQuery, searchPlaceholder } from './search';

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
