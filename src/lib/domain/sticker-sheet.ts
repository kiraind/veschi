import { CHARS, FALLBACK_WIDTH, UNITS_PER_EM, WIDTHS } from './caption-metrics';

/**
 * Sticker sheet layout (spec «Наклейки»): A4, 10 columns of 20 mm with 5 mm
 * side margins. A sticker is the QR with a 1 mm white border, plus up to three
 * caption lines under it; every row is as tall as its tallest sticker, so the
 * sheet can be cut along straight lines. All sizes are in millimetres.
 */
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const COLUMNS = 10;
export const CELL_WIDTH_MM = 20;
export const MARGIN_X_MM = (PAGE_WIDTH_MM - COLUMNS * CELL_WIDTH_MM) / 2; // 5 mm
/** Printers leave the top and bottom edges blank more often than the sides. */
export const MARGIN_Y_MM = 8;
export const PRINTABLE_HEIGHT_MM = PAGE_HEIGHT_MM - 2 * MARGIN_Y_MM;

/** White border around the QR; the cut lines run along the outer edge. */
export const STICKER_PADDING_MM = 1;
export const QR_SIZE_MM = CELL_WIDTH_MM - 2 * STICKER_PADDING_MM; // 18 mm
/** A sticker without a caption is square. */
export const BLANK_HEIGHT_MM = QR_SIZE_MM + 2 * STICKER_PADDING_MM;

/** Caption: DejaVu Sans, wrapped by words into up to CAPTION_MAX_LINES lines. */
export const CAPTION_FONT_PT = 6.5;
export const CAPTION_MAX_LINES = 3;
export const CAPTION_WIDTH_MM = QR_SIZE_MM;
const PT_PER_MM = 72 / 25.4;
/** DejaVu Sans line height (ascender − descender), in em. */
const CAPTION_LINE_EM = 1.164;
export const CAPTION_LINE_MM = (CAPTION_FONT_PT * CAPTION_LINE_EM) / PT_PER_MM;
/** Space between the QR and the first caption line. */
export const CAPTION_GAP_MM = 0.3;

/** Upper limit for one batch, to keep a PDF printable in one go. */
export const MAX_SHEETS_PER_BATCH = 20;
/** Rows of blank stickers on a sheet: 14 × 10 = 140 stickers. */
export const BLANK_ROWS_PER_SHEET = Math.floor(PRINTABLE_HEIGHT_MM / BLANK_HEIGHT_MM);
export const BLANKS_PER_SHEET = BLANK_ROWS_PER_SHEET * COLUMNS;

/** One caption per non-empty line, trimmed. */
export function parseCaptions(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

const ELLIPSIS = '…';
const charWidths = new Map([...CHARS].map((char, i) => [char, WIDTHS[i]]));

/** Width of the text in the caption font at 1 pt, in points. */
export function captionWidthPt(text: string): number {
	let units = 0;
	for (const char of text) units += charWidths.get(char) ?? FALLBACK_WIDTH;
	return units / UNITS_PER_EM;
}

const lineWidthPt = (CAPTION_WIDTH_MM * PT_PER_MM) / CAPTION_FONT_PT;
const fits = (text: string) => captionWidthPt(text) <= lineWidthPt;

export interface WrappedCaption {
	lines: string[];
	/** Part of the caption did not fit and ends with «…». */
	truncated: boolean;
}

/** The longest start of `text` that fits on a line together with `suffix`. */
function longestFit(text: string, suffix = ''): string {
	let kept = '';
	for (const char of text) {
		if (!fits(kept + char + suffix)) break;
		kept += char;
	}
	return kept;
}

/**
 * Wraps a caption by words into lines of the sticker width. A word longer
 * than a line is broken where it reaches the edge. Text that does not fit
 * into CAPTION_MAX_LINES is cut, and the last line ends with «…».
 */
export function wrapCaption(caption: string): WrappedCaption {
	const words = caption.split(/\s+/).filter((word) => word.length > 0);
	const lines: string[] = [];
	let line = '';
	for (let word of words) {
		const joined = line ? `${line} ${word}` : word;
		if (fits(joined)) {
			line = joined;
			continue;
		}
		if (line) {
			lines.push(line);
			line = '';
		}
		while (!fits(word)) {
			const head = longestFit(word) || word.charAt(0);
			lines.push(head);
			word = word.slice(head.length);
		}
		line = word;
	}
	if (line) lines.push(line);
	if (lines.length <= CAPTION_MAX_LINES) return { lines, truncated: false };

	const kept = lines.slice(0, CAPTION_MAX_LINES - 1);
	const last = lines[CAPTION_MAX_LINES - 1] ?? '';
	kept.push(longestFit(last, ELLIPSIS).trimEnd() + ELLIPSIS);
	return { lines: kept, truncated: true };
}

/** Height of a sticker with the given number of caption lines. */
export function stickerHeight(captionLines: number): number {
	if (captionLines === 0) return BLANK_HEIGHT_MM;
	return BLANK_HEIGHT_MM + CAPTION_GAP_MM + captionLines * CAPTION_LINE_MM;
}

export interface CellPosition {
	page: number;
	/** Top-left corner of the cell, from the top-left corner of the page. */
	x: number;
	y: number;
	/** Height of the row the cell is in. */
	height: number;
}

export interface SheetLayout {
	cells: CellPosition[];
	pages: number;
	/** Bottom edges of the rows on each page, for the cut lines. */
	rowEdges: number[][];
}

/**
 * Places stickers row by row, left to right, in the given order. Every row is
 * as tall as its tallest sticker; a row that does not fit goes to a new page.
 * With `fill`, the last row and the rest of the last page are filled with
 * blank stickers (their cells come after the given ones).
 */
export function layoutSheets(heights: number[], fill = false): SheetLayout {
	const cells: CellPosition[] = [];
	const rowEdges: number[][] = [];
	let page = -1;
	let edges: number[] = [];
	let y = Infinity;
	const addRow = (rowHeights: number[]) => {
		const height = Math.max(...rowHeights);
		if (y + height > PAGE_HEIGHT_MM - MARGIN_Y_MM + 1e-9) {
			page++;
			y = MARGIN_Y_MM;
			edges = [];
			rowEdges.push(edges);
		}
		rowHeights.forEach((_, column) => {
			cells.push({ page, x: MARGIN_X_MM + column * CELL_WIDTH_MM, y, height });
		});
		y += height;
		edges.push(y);
	};

	for (let start = 0; start < heights.length; start += COLUMNS) {
		const row = heights.slice(start, start + COLUMNS);
		if (fill) while (row.length < COLUMNS) row.push(BLANK_HEIGHT_MM);
		addRow(row);
	}
	if (fill && page >= 0) {
		while (y + BLANK_HEIGHT_MM <= PAGE_HEIGHT_MM - MARGIN_Y_MM + 1e-9) {
			addRow(Array<number>(COLUMNS).fill(BLANK_HEIGHT_MM));
		}
	}
	return { cells, pages: page + 1, rowEdges };
}

/** Heights of the requested stickers in print order: captioned ones first, then blank. */
export function stickerHeights(captions: (string | null)[]): number[] {
	return captions.map((caption) => stickerHeight(caption ? wrapCaption(caption).lines.length : 0));
}

export interface SheetPlan {
	sheets: number;
	total: number;
	captioned: number;
	/** Blank stickers added on top of the requested ones to fill the last sheet. */
	padding: number;
}

/**
 * Lays out the captions and the blank stickers and, with `fill`, fills the
 * rest of the last sheet with blank ones: 7 captions + 10 blank → 1 sheet
 * with 7 + 133 stickers (without `fill` — 7 + 10).
 */
export function planSheets(captions: string[], blankCount: number, fill = true): SheetPlan {
	const requested = captions.length + blankCount;
	if (requested > MAX_SHEETS_PER_BATCH * BLANKS_PER_SHEET) {
		// Too many for a batch whatever the captions; skip laying out a huge list.
		const sheets = Math.ceil(requested / BLANKS_PER_SHEET);
		return { sheets, total: requested, captioned: captions.length, padding: 0 };
	}
	const heights = [...stickerHeights(captions), ...Array<number>(blankCount).fill(BLANK_HEIGHT_MM)];
	const { cells, pages } = layoutSheets(heights, fill);
	return {
		sheets: pages,
		total: cells.length,
		captioned: captions.length,
		padding: cells.length - requested
	};
}
