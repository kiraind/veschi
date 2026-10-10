import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
	CAPTION_SIDE_PADDING_MM,
	CAPTION_WIDTH_MM,
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
	fitCaption
} from '$lib/domain/sticker-sheet';

/** Cell content, top to bottom (mm from the top of the cell). */
export const QR_SIZE_MM = 25;
const QR_TOP_MM = 1.5;
const CAPTION_TOP_MM = 27.3;
/**
 * The ID is printed inside the QR, in a blank square in its centre. Level H
 * restores up to 30 % of the code; a square of ~31 % of the side (~10 % of the
 * area) leaves the rest of that budget for dirt and scratches.
 */
const QR_ERROR_CORRECTION = 'H';
const ID_BOX_SHARE = 0.31;
/** Blank space around the ID, in modules, so the nearest modules do not read as letters. */
const ID_PADDING_MODULES = 1;
/** Space between the two lines of the ID, in cap heights. */
const ID_LINE_GAP_SHARE = 0.25;
/** Cap height of DejaVu Sans Mono Bold, in em: the ID has only capitals and digits. */
const ID_CAP_HEIGHT_EM = 0.729;
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
 * the alphanumeric mode and stays as coarse as possible.
 */
export function qrContent(baseUrl: string, code: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${code}`.toUpperCase();
}

export interface QrLayout {
	/** Modules per side. */
	size: number;
	/** The blank centre square for the ID: first module and side, in modules. */
	box: { start: number; side: number };
	/** Dark modules outside the box merged into horizontal runs: [row, startColumn, length]. */
	runs: [number, number, number][];
}

/** The QR matrix with a blank square in the centre (odd side, so it is exactly centred). */
export function qrLayout(text: string): QrLayout {
	const { modules } = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });
	const size = modules.size;
	const side = 2 * Math.round((size * ID_BOX_SHARE - 1) / 2) + 1;
	const start = (size - side) / 2;
	const inBox = (row: number, col: number) =>
		row >= start && row < start + side && col >= start && col < start + side;
	const runs: [number, number, number][] = [];
	for (let row = 0; row < size; row++) {
		let begin = -1;
		for (let col = 0; col <= size; col++) {
			const dark = col < size && !inBox(row, col) && modules.get(row, col) === 1;
			if (dark && begin < 0) begin = col;
			if (!dark && begin >= 0) {
				runs.push([row, begin, col - begin]);
				begin = -1;
			}
		}
	}
	return { size, box: { start, side }, runs };
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

/** Draws the QR with the ID in two lines (`K7M` over `4QX`) in its centre. */
function drawQr(doc: PDFKit.PDFDocument, baseUrl: string, code: string, x: number, y: number) {
	const { size, box, runs } = qrLayout(qrContent(baseUrl, code));
	const module = mm(QR_SIZE_MM) / size;
	for (const [row, col, length] of runs) {
		doc.rect(x + col * module, y + row * module, length * module, module);
	}
	doc.fillColor('black').fill();

	const lines = [code.slice(0, 3), code.slice(3)];
	const inner = box.side * module - 2 * ID_PADDING_MODULES * module;
	doc.font(ID_FONT).fontSize(1);
	const lineWidth = Math.max(...lines.map((line) => doc.widthOfString(line)));
	const blockHeight = ID_CAP_HEIGHT_EM * (2 + ID_LINE_GAP_SHARE);
	const fontSize = Math.min(inner / lineWidth, inner / blockHeight);
	doc.fontSize(fontSize);
	const centre = (box.start + box.side / 2) * module;
	const top = y + centre - (blockHeight * fontSize) / 2;
	lines.forEach((line, i) => {
		const baseline = top + ID_CAP_HEIGHT_EM * fontSize * (1 + i * (1 + ID_LINE_GAP_SHARE));
		doc.text(line, x + centre - doc.widthOfString(line) / 2, baseline, {
			lineBreak: false,
			baseline: 'alphabetic'
		});
	});
}

function drawCaption(doc: PDFKit.PDFDocument, caption: string, cellX: number, y: number) {
	const { text, fontSize } = fitCaption(caption);
	doc.font(CAPTION_FONT).fontSize(fontSize).fillColor('black');
	doc.text(text, cellX + mm(CAPTION_SIDE_PADDING_MM), y, {
		width: mm(CAPTION_WIDTH_MM),
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
			qrBaseUrl,
			sticker.code,
			x + mm((CELL_WIDTH_MM - QR_SIZE_MM) / 2),
			y + mm(QR_TOP_MM)
		);
		if (sticker.caption) drawCaption(doc, sticker.caption, x, y + mm(CAPTION_TOP_MM));
	});

	doc.end();
	return done;
}
