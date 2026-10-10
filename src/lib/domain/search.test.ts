import { describe, expect, it } from 'vitest';
import { likePattern, parseSearchQuery } from './search';

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

describe('likePattern', () => {
	it('escapes wildcards', () => {
		expect(likePattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
	});
});
