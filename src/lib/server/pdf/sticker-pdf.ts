import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
	CAPTION_GAP_MM,
	MARGIN_X_MM,
	MARGIN_Y_MM,
	PAGE_HEIGHT_MM,
	PAGE_WIDTH_MM,
	ID_CAP_HEIGHT_EM,
	ID_GAP_MM,
	type SheetRow,
	type StickerWidth,
	captionFontPt,
	captionLineMm,
	columns,
	idBlockMm,
	idFontMm,
	idUnderQr,
	layoutSheets,
	qrSize,
	stickerPadding,
	wrapCaption
} from '$lib/domain/sticker-sheet';
import { formatCode } from '$lib/domain/sticker-code';

/**
 * The ID is printed inside the QR, in a blank square in its centre. Level H
 * restores up to 30 % of the code; a square of ~31 % of the side (~10 % of the
 * area) leaves the rest of that budget for dirt and scratches.
 */
const QR_ERROR_CORRECTION = 'H';
/**
 * A 10 mm sticker has the ID under the QR, so its QR has no box and level M:
 * fewer modules than H, so they stay as large as possible on a 9 mm code.
 */
const QR_ERROR_CORRECTION_NO_BOX = 'M';
const ID_BOX_SHARE = 0.31;
/** Blank space around the ID, in modules, so the nearest modules do not read as letters. */
const ID_PADDING_MODULES = 1;
/** Space between the two lines of the ID, in cap heights. */
const ID_LINE_GAP_SHARE = 0.25;
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
	width: StickerWidth;
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
	/** The blank centre square for the ID: first module and side, in modules (side 0 without one). */
	box: { start: number; side: number };
	/** Dark modules outside the box merged into horizontal runs: [row, startColumn, length]. */
	runs: [number, number, number][];
}

/**
 * The QR matrix with a blank square in the centre (odd side, so it is exactly
 * centred), or, with `box` false, the plain QR at level M.
 */
export function qrLayout(text: string, box = true): QrLayout {
	const { modules } = QRCode.create(text, {
		errorCorrectionLevel: box ? QR_ERROR_CORRECTION : QR_ERROR_CORRECTION_NO_BOX
	});
	const size = modules.size;
	const side = box ? 2 * Math.round((size * ID_BOX_SHARE - 1) / 2) + 1 : 0;
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

/**
 * Cut lines: the bottom edge of every row across the page, and the column
 * edges of every row. The column edges of the first and the last row run on
 * to the page edges, through the margins.
 */
function drawCutLines(doc: PDFKit.PDFDocument, rows: SheetRow[]) {
	doc.save().lineWidth(CUT_LINE_PT).strokeColor(CUT_LINE_COLOR);
	rows.forEach((row, i) => {
		const top = i === 0 ? 0 : row.top;
		const bottom = i === rows.length - 1 ? PAGE_HEIGHT_MM : row.top + row.height;
		for (let c = 0; c <= columns(row.width); c++) {
			const x = mm(MARGIN_X_MM + c * row.width);
			doc.moveTo(x, mm(top)).lineTo(x, mm(bottom));
		}
	});
	for (const edge of [MARGIN_Y_MM, ...rows.map((row) => row.top + row.height)]) {
		doc.moveTo(0, mm(edge)).lineTo(mm(PAGE_WIDTH_MM), mm(edge));
	}
	doc.stroke().restore();
}

/**
 * Draws the QR with the ID in two lines (`K7M` over `4QX`) in its centre or,
 * on a 10 mm sticker, `K7M-4QX` under the QR across its whole width.
 * `x`, `y` — the top-left corner inside the sticker's border.
 */
function drawQr(
	doc: PDFKit.PDFDocument,
	baseUrl: string,
	{ code, width }: PdfSticker,
	x: number,
	y: number
) {
	const under = idUnderQr(width);
	const side = mm(qrSize(width));
	const { size, box, runs } = qrLayout(qrContent(baseUrl, code), !under);
	const module = side / size;
	for (const [row, col, length] of runs) {
		doc.rect(x + col * module, y + row * module, length * module, module);
	}
	doc.fillColor('black').fill();

	if (under) {
		const fontSize = mm(idFontMm(width));
		const id = formatCode(code);
		doc.font(ID_FONT).fontSize(fontSize);
		const baseline = y + side + mm(ID_GAP_MM) + ID_CAP_HEIGHT_EM * fontSize;
		doc.text(id, x + (side - doc.widthOfString(id)) / 2, baseline, {
			lineBreak: false,
			baseline: 'alphabetic'
		});
		return;
	}

	const lines = [code.slice(0, 3), code.slice(3)];
	const boxInner = box.side * module - 2 * ID_PADDING_MODULES * module;
	doc.font(ID_FONT).fontSize(1);
	const lineWidth = Math.max(...lines.map((line) => doc.widthOfString(line)));
	const blockHeight = ID_CAP_HEIGHT_EM * (2 + ID_LINE_GAP_SHARE);
	const fontSize = Math.min(boxInner / lineWidth, boxInner / blockHeight);
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

function drawCaption(
	doc: PDFKit.PDFDocument,
	caption: string,
	width: StickerWidth,
	x: number,
	y: number
) {
	doc.font(CAPTION_FONT).fontSize(captionFontPt(width)).fillColor('black');
	wrapCaption(caption, width).lines.forEach((line, i) => {
		doc.text(line, x, y + i * mm(captionLineMm(width)), {
			width: mm(qrSize(width)),
			align: 'center',
			lineBreak: false
		});
	});
}

/** Renders stickers in the given order (see layoutSheets) on as many A4 sheets as needed. */
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

	// Without `fill` the cells are the stickers, in the same order.
	const { cells, rows } = layoutSheets(stickers);
	let page = -1;
	stickers.forEach((sticker, index) => {
		const cell = cells[index];
		if (!cell) return;
		if (cell.page !== page) {
			page = cell.page;
			doc.addPage();
			drawCutLines(
				doc,
				rows.filter((row) => row.page === page)
			);
		}
		const x = mm(cell.x + stickerPadding(sticker.width));
		const y = mm(cell.y + stickerPadding(sticker.width));
		drawQr(doc, qrBaseUrl, sticker, x, y);
		if (sticker.caption) {
			const top = y + mm(qrSize(sticker.width) + idBlockMm(sticker.width) + CAPTION_GAP_MM);
			drawCaption(doc, sticker.caption, sticker.width, x, top);
		}
	});

	doc.end();
	return done;
}
