import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
	it('keeps same-site paths', () => {
		expect(safeRedirectPath('/K7M4QX')).toBe('/K7M4QX');
		expect(safeRedirectPath('/items/1?x=2')).toBe('/items/1?x=2');
	});

	it('rejects external and malformed targets', () => {
		expect(safeRedirectPath('https://evil.example')).toBe('/');
		expect(safeRedirectPath('//evil.example')).toBe('/');
		expect(safeRedirectPath('/\\evil.example')).toBe('/');
		expect(safeRedirectPath('/\t/evil.example')).toBe('/');
		expect(safeRedirectPath('/\n/evil.example')).toBe('/');
		expect(safeRedirectPath('/ok\r\nSet-Cookie: x')).toBe('/');
		expect(safeRedirectPath(null)).toBe('/');
		expect(safeRedirectPath('', '/search')).toBe('/search');
	});
});
