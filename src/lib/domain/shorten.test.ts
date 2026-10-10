import { describe, expect, it } from 'vitest';
import { shortenFileName, shortenUrl } from './shorten';

describe('shortenFileName', () => {
	it('keeps short names', () => {
		expect(shortenFileName('manual.pdf')).toBe('manual.pdf');
	});

	it('keeps the beginning, the end and the extension', () => {
		const short = shortenFileName('Очень_длинная_инструкция_к_паяльнику_Hakko_FX-888D.pdf', 32);
		expect(short).toHaveLength(32);
		expect(short.startsWith('Очень_длинная')).toBe(true);
		expect(short.endsWith('-888D.pdf')).toBe(true);
		expect(short).toContain('…');
	});

	it('works without an extension', () => {
		const short = shortenFileName('a'.repeat(50), 20);
		expect(short).toHaveLength(20);
		expect(short).toContain('…');
	});
});

describe('shortenUrl', () => {
	it('drops the scheme of short links', () => {
		expect(shortenUrl('https://example.com/')).toBe('example.com');
	});

	it('keeps the beginning with the domain', () => {
		const short = shortenUrl('https://www.example.com/catalog/very/long/path/to/page?x=1', 30);
		expect(short).toBe('www.example.com/catalog/very/…');
		expect(short).toHaveLength(30);
	});

	it('never cuts the domain', () => {
		const host = `${'sub.'.repeat(12)}example.com`;
		expect(shortenUrl(`https://${host}/path`, 20)).toBe(`${host}…`);
	});
});
