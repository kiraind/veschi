import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { generateCodes } from '$lib/domain/sticker-code';
import { qrContent, qrRuns, renderStickerPdf } from './sticker-pdf';

function pageCount(pdf: Buffer): number {
	return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

describe('sticker PDF', () => {
	it('puts the upper-case URL into the QR so the alphanumeric mode is used', () => {
		const text = qrContent('https://v.ex.io/', 'K7M4QX');
		expect(text).toBe('HTTPS://V.EX.IO/K7M4QX');
		const segments = QRCode.create(text, { errorCorrectionLevel: 'M' }).segments;
		expect(segments.map((s) => s.mode.id)).toEqual(['Alphanumeric']);
	});

	it('merges dark modules into runs inside the matrix', () => {
		const { size, runs } = qrRuns('HTTPS://V.EX.IO/K7M4QX');
		expect(size).toBe(25); // version 2: 22 alphanumeric characters at level M
		// Top-left finder pattern: the first row starts with 7 dark modules.
		expect(runs[0]).toEqual([0, 0, 7]);
		for (const [row, col, length] of runs) {
			expect(row).toBeLessThan(size);
			expect(col + length).toBeLessThanOrEqual(size);
		}
	});

	it('renders one A4 page per 54 stickers as a valid PDF', async () => {
		const codes = generateCodes([], 108);
		const stickers = codes.map((code, i) => ({
			code,
			caption: i < 7 ? `Коробка с микросхемами ${i}` : null
		}));
		const pdf = await renderStickerPdf(stickers, 'https://v.ex.io');
		expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
		expect(pageCount(pdf)).toBe(2);
		expect(pageCount(await renderStickerPdf(stickers.slice(0, 54), 'https://v.ex.io'))).toBe(1);
	});
});
