import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, formatCode, isCode, normalizeCode } from './sticker-code';

describe('sticker codes', () => {
	it('alphabet has 31 characters without look-alikes', () => {
		expect(CODE_ALPHABET).toHaveLength(31);
		for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c);
	});

	it('normalizes any case and dash placement to one code', () => {
		for (const input of ['k7m4qx', 'K7M-4QX', 'k7m-4qx', ' K7M4QX ']) {
			expect(normalizeCode(input)).toBe('K7M4QX');
		}
	});

	it('rejects invalid codes', () => {
		expect(normalizeCode('K7M4Q')).toBeNull();
		expect(normalizeCode('K7M4Q0')).toBeNull();
		expect(normalizeCode('K7M4QXX')).toBeNull();
		expect(normalizeCode('')).toBeNull();
	});

	it('formats with a dash', () => {
		expect(formatCode('K7M4QX')).toBe('K7M-4QX');
		expect(isCode('k7m4qx')).toBe(true);
		expect(isCode('login')).toBe(false);
	});
});
