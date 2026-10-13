import { describe, expect, it } from 'vitest';
import { isGatewayStatus, markOfflineCopy, offlineCopyText, offlinePage } from './offline';

describe('isGatewayStatus', () => {
	it.each([
		[502, true],
		[503, true],
		[504, true],
		[500, false],
		[404, false],
		[200, false]
	])('%i → %s', (status, expected) => {
		expect(isGatewayStatus(status)).toBe(expected);
	});
});

describe('markOfflineCopy', () => {
	it('adds the save time to the <html> tag', () => {
		const html = '<!doctype html>\n<html lang="ru" data-theme="dark"><body></body></html>';
		expect(markOfflineCopy(html, new Date('2026-10-13T10:05:00Z'))).toBe(
			'<!doctype html>\n<html data-offline-copy="2026-10-13T10:05:00.000Z" lang="ru" data-theme="dark"><body></body></html>'
		);
	});

	it('leaves the time empty when the copy has no date', () => {
		expect(markOfflineCopy('<html>', new Date(''))).toBe('<html data-offline-copy="">');
	});
});

describe('offlineCopyText', () => {
	it('names the local time of the copy', () => {
		const savedAt = new Date(2026, 9, 13, 14, 5).toISOString();
		expect(offlineCopyText(savedAt)).toBe(
			'Сервер недоступен: это сохранённая копия страницы от 2026-10-13 14:05, изменения не сохранятся'
		);
	});

	it('works without a time', () => {
		expect(offlineCopyText('')).toBe(
			'Сервер недоступен: это сохранённая копия страницы, изменения не сохранятся'
		);
	});
});

describe('offlinePage', () => {
	it('explains each reason', () => {
		expect(offlinePage('network')).toContain('<h1>Нет связи с сервером</h1>');
		expect(offlinePage('timeout')).toContain('<h1>Сервер долго не отвечает</h1>');
		expect(offlinePage('down')).toContain('<h1>Сервер недоступен</h1>');
	});

	it('reloads by itself only when the server was not merely slow', () => {
		expect(offlinePage('network')).toContain('if (true || !navigator.onLine)');
		expect(offlinePage('timeout')).toContain('if (false || !navigator.onLine)');
	});
});
