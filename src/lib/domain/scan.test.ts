import { describe, expect, it } from 'vitest';
import { extractCode } from './scan';

describe('extractCode', () => {
	it('accepts a bare code in any case, with or without the dash', () => {
		for (const text of ['K7M4QX', 'k7m4qx', 'K7M-4QX', ' k7m-4qx ']) {
			expect(extractCode(text)).toBe('K7M4QX');
		}
	});

	it('accepts a URL with any domain', () => {
		for (const text of [
			'HTTPS://V.EX.IO/K7M4QX',
			'https://veschi.example.com/k7m4qx',
			'http://localhost:3000/K7M-4QX/',
			'https://other.domain/K7M4QX?utm=1#x'
		]) {
			expect(extractCode(text)).toBe('K7M4QX');
		}
	});

	it('rejects text without a code', () => {
		for (const text of ['', 'HTTPS://V.EX.IO', 'https://example.com/items', 'привет', 'K7M4Q0']) {
			expect(extractCode(text)).toBeNull();
		}
	});
});
