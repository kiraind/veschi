import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
	CAPTION_FONT_PT,
	CAPTION_GAP_MM,
	CAPTION_LINE_MM,
	CAPTION_WIDTH_MM,
	CELL_WIDTH_MM,
	COLUMNS,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	QR_SIZE_MM,
	STICKER_PADDING_MM,
	layoutSheets,
	stickerHeights,
	wrapCaption
} from '$lib/domain/sticker-sheet';

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

/** Cut lines: the column edges across the page and the bottom edge of every row. */
function drawCutLines(doc: PDFKit.PDFDocument, rowEdges: number[]) {
	doc.save().lineWidth(CUT_LINE_PT).strokeColor(CUT_LINE_COLOR);
	for (let c = 0; c <= COLUMNS; c++) {
		const x = mm(MARGIN_X_MM + c * CELL_WIDTH_MM);
		doc.moveTo(x, 0).lineTo(x, mm(PAGE_HEIGHT_MM));
	}
	for (const edge of [MARGIN_Y_MM, ...rowEdges]) {
		doc.moveTo(0, mm(edge)).lineTo(mm(PAGE_WIDTH_MM), mm(edge));
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

function drawCaption(doc: PDFKit.PDFDocument, caption: string, x: number, y: number) {
	doc.font(CAPTION_FONT).fontSize(CAPTION_FONT_PT).fillColor('black');
	wrapCaption(caption).lines.forEach((line, i) => {
		doc.text(line, x, y + i * mm(CAPTION_LINE_MM), {
			width: mm(CAPTION_WIDTH_MM),
			align: 'center',
			lineBreak: false
		});
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

	const { cells, rowEdges } = layoutSheets(stickerHeights(stickers.map((s) => s.caption)));
	let page = -1;
	stickers.forEach((sticker, index) => {
		const cell = cells[index];
		if (!cell) return;
		if (cell.page !== page) {
			page = cell.page;
			doc.addPage();
			drawCutLines(doc, rowEdges[page] ?? []);
		}
		const x = mm(cell.x + STICKER_PADDING_MM);
		const y = mm(cell.y + STICKER_PADDING_MM);
		drawQr(doc, qrBaseUrl, sticker.code, x, y);
		if (sticker.caption) {
			drawCaption(doc, sticker.caption, x, y + mm(QR_SIZE_MM + CAPTION_GAP_MM));
		}
	});

	doc.end();
	return done;
}
