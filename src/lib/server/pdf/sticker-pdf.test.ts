import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { generateCodes } from '$lib/domain/sticker-code';
import path from 'node:path';
import jsQR from 'jsqr';
import PDFDocument from 'pdfkit';
import { captionWidthPt } from '$lib/domain/sticker-sheet';
import { type QrLayout, qrContent, qrLayout, renderStickerPdf } from './sticker-pdf';

function pageCount(pdf: Buffer): number {
	return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

/** Rasterizes the QR (4 px per module, 4-module quiet zone) and reads it back. */
function decode({ size, runs }: QrLayout): string | null {
	const px = 4;
	const side = (size + 8) * px;
	const data = new Uint8ClampedArray(side * side * 4).fill(255);
	for (const [row, col, length] of runs) {
		for (let y = (row + 4) * px; y < (row + 5) * px; y++) {
			for (let x = (col + 4) * px; x < (col + 4 + length) * px; x++) {
				data.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
			}
		}
	}
	return jsQR(data, side, side, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

describe('sticker PDF', () => {
	it('puts the upper-case URL into the QR so the alphanumeric mode is used', () => {
		const text = qrContent('https://v.ex.io/', 'K7M4QX');
		expect(text).toBe('HTTPS://V.EX.IO/K7M4QX');
		const segments = QRCode.create(text, { errorCorrectionLevel: 'H' }).segments;
		expect(segments.map((s) => s.mode.id)).toEqual(['Alphanumeric']);
	});

	it('leaves a centred square for the ID and keeps the finder patterns', () => {
		const { size, box, runs } = qrLayout('HTTPS://V.EX.IO/K7M4QX');
		expect(size).toBe(29); // version 3: 22 alphanumeric characters at level H
		expect(box).toEqual({ start: 10, side: 9 });
		// Top-left finder pattern: the first row starts with 7 dark modules.
		expect(runs[0]).toEqual([0, 0, 7]);
		for (const [row, col, length] of runs) {
			expect(col + length).toBeLessThanOrEqual(size);
			const crossesBox =
				row >= box.start &&
				row < box.start + box.side &&
				col < box.start + box.side &&
				col + length > box.start;
			expect(crossesBox).toBe(false);
		}
	});

	it('decodes with the ID square for every code and URL length', () => {
		const bases = [
			'https://a.bc', // version 2
			'https://v.ex.io', // version 3
			'https://veschi.example.com', // version 3
			'https://stickers.veschi.example.com', // version 4
			'https://stickers.veschi.example.com/s/abcdefghijkl' // version 5
		];
		const codes = generateCodes([], 60);
		const versions = new Set<number>();
		for (const base of bases) {
			for (const code of codes) {
				const text = qrContent(base, code);
				const layout = qrLayout(text);
				versions.add(layout.size);
				expect(decode(layout)).toBe(text);
			}
		}
		expect([...versions].sort((a, b) => a - b)).toEqual([25, 29, 33, 37]);
	});

	it('measures captions like the PDF does', () => {
		const doc = new PDFDocument({ autoFirstPage: false });
		doc.font(path.resolve('assets/fonts/DejaVuSans.ttf')).fontSize(10);
		for (const text of [
			'по одной наклейке',
			'Шуруповёрт Makita DF333',
			'Резисторы 0805 10кОм «±5%»'
		]) {
			expect(captionWidthPt(text) * 10).toBeCloseTo(doc.widthOfString(text), 0);
		}
	});

	it('renders the sheets as a valid PDF, starting a page when a row does not fit', async () => {
		const codes = generateCodes([], 140);
		const stickers = codes.map((code, i) => ({
			code,
			caption: i < 7 ? `Коробка с микросхемами ${i}` : null
		}));
		const pdf = await renderStickerPdf(stickers, 'https://v.ex.io');
		expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
		// The captioned row is taller, so the last blank row moves to page 2.
		expect(pageCount(pdf)).toBe(2);
		const blank = stickers
			.slice(10)
			.concat(stickers.slice(0, 10).map((s) => ({ ...s, caption: null })));
		expect(pageCount(await renderStickerPdf(blank, 'https://v.ex.io'))).toBe(1);
	});
});
