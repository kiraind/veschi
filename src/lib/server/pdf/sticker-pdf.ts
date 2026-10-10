import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatCode } from '$lib/domain/sticker-code';
import {
	CELL_HEIGHT_MM,
	CELL_WIDTH_MM,
	COLUMNS,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	ROWS,
	STICKERS_PER_SHEET,
	cellPosition,
	truncateCaption
} from '$lib/domain/sticker-sheet';

/** Cell content, top to bottom (mm from the top of the cell). */
export const QR_SIZE_MM = 20;
const QR_TOP_MM = 2;
const ID_TOP_MM = 22.6;
const ID_FONT_PT = 11;
const CAPTION_TOP_MM = 27.2;
const CAPTION_FONT_PT = 7;
const TEXT_SIDE_PADDING_MM = 1.5;
const CUT_LINE_PT = 0.25;
const CUT_LINE_COLOR = '#b0b0b0';

const PT_PER_MM = 72 / 25.4;
const mm = (value: number) => value * PT_PER_MM;

const fontPath = (file: string) => path.resolve(process.cwd(), 'assets/fonts', file);
const ID_FONT = fontPath('DejaVuSansMono-Bold.ttf');
const CAPTION_FONT = fontPath('DejaVuSans.ttf');

export interface PdfSticker {
	code: string;
	caption: string | null;
}

/**
 * QR payload: `<QR_BASE_URL>/<CODE>` entirely in upper case, so the QR uses
 * the alphanumeric mode and stays coarse enough for 20 × 20 mm.
 */
export function qrContent(baseUrl: string, code: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${code}`.toUpperCase();
}

/** Dark modules of a QR matrix merged into horizontal runs: [row, startColumn, length]. */
export function qrRuns(text: string): { size: number; runs: [number, number, number][] } {
	const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
	const runs: [number, number, number][] = [];
	for (let row = 0; row < modules.size; row++) {
		let start = -1;
		for (let col = 0; col <= modules.size; col++) {
			const dark = col < modules.size && modules.get(row, col);
			if (dark && start < 0) start = col;
			if (!dark && start >= 0) {
				runs.push([row, start, col - start]);
				start = -1;
			}
		}
	}
	return { size: modules.size, runs };
}

function drawCutLines(doc: PDFKit.PDFDocument) {
	doc.save().lineWidth(CUT_LINE_PT).strokeColor(CUT_LINE_COLOR);
	for (let c = 0; c <= COLUMNS; c++) {
		const x = mm(MARGIN_X_MM + c * CELL_WIDTH_MM);
		doc.moveTo(x, 0).lineTo(x, mm(PAGE_HEIGHT_MM));
	}
	for (let r = 0; r <= ROWS; r++) {
		const y = mm(MARGIN_Y_MM + r * CELL_HEIGHT_MM);
		doc.moveTo(0, y).lineTo(mm(PAGE_WIDTH_MM), y);
	}
	doc.stroke().restore();
}

function drawQr(doc: PDFKit.PDFDocument, text: string, x: number, y: number) {
	const { size, runs } = qrRuns(text);
	const module = mm(QR_SIZE_MM) / size;
	for (const [row, col, length] of runs) {
		doc.rect(x + col * module, y + row * module, length * module, module);
	}
	doc.fillColor('black').fill();
}

/** Writes one line centred in the cell, shrinking the font if the text is too wide. */
function drawCentered(
	doc: PDFKit.PDFDocument,
	text: string,
	font: string,
	maxSize: number,
	cellX: number,
	y: number
) {
	const width = mm(CELL_WIDTH_MM - 2 * TEXT_SIDE_PADDING_MM);
	doc.font(font).fontSize(maxSize);
	const natural = doc.widthOfString(text);
	if (natural > width) doc.fontSize((maxSize * width) / natural);
	doc.fillColor('black').text(text, cellX + mm(TEXT_SIDE_PADDING_MM), y, {
		width,
		align: 'center',
		lineBreak: false
	});
}

/** Renders stickers in print order on as many A4 sheets as needed. */
export async function renderStickerPdf(stickers: PdfSticker[], qrBaseUrl: string): Promise<Buffer> {
	const doc = new PDFDocument({
		size: 'A4',
		margin: 0,
		autoFirstPage: false,
		font: CAPTION_FONT,
		info: { Title: 'Наклейки', Creator: 'Вещи' }
	});
	const chunks: Buffer[] = [];
	doc.on('data', (chunk: Buffer) => chunks.push(chunk));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
	});

	stickers.forEach((sticker, index) => {
		if (index % STICKERS_PER_SHEET === 0) {
			doc.addPage();
			drawCutLines(doc);
		}
		const cell = cellPosition(index);
		const x = mm(cell.x);
		const y = mm(cell.y);
		drawQr(
			doc,
			qrContent(qrBaseUrl, sticker.code),
			x + mm((CELL_WIDTH_MM - QR_SIZE_MM) / 2),
			y + mm(QR_TOP_MM)
		);
		drawCentered(doc, formatCode(sticker.code), ID_FONT, ID_FONT_PT, x, y + mm(ID_TOP_MM));
		if (sticker.caption) {
			const caption = truncateCaption(sticker.caption);
			drawCentered(doc, caption, CAPTION_FONT, CAPTION_FONT_PT, x, y + mm(CAPTION_TOP_MM));
		}
	});

	doc.end();
	return done;
}
