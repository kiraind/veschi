import { CHARS, FALLBACK_WIDTH, UNITS_PER_EM, WIDTHS } from './caption-metrics';

/**
 * Sticker sheet layout (spec «Наклейки»): A4, a 200 mm wide band with 5 mm
 * side margins, cut into stickers 10 mm wide (20 per row), 20 mm wide (10 per
 * row) or 40 mm wide (5 per row). A 20 or 40 mm sticker is the QR with the ID
 * inside and a 1 mm white border, plus up to three caption lines under it. A
 * 10 mm sticker is a 10 × 10 mm square: the QR with the ID (`K7M-4QX`) under
 * it across the whole width, and no caption. A row holds stickers of one
 * width and is as tall as its tallest sticker, so the sheet can be cut along
 * straight lines. All sizes are in millimetres.
 */
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const ROW_WIDTH_MM = 200;
export const MARGIN_X_MM = (PAGE_WIDTH_MM - ROW_WIDTH_MM) / 2; // 5 mm
/** Printers leave the top and bottom edges blank more often than the sides. */
export const MARGIN_Y_MM = 8;
export const PRINTABLE_HEIGHT_MM = PAGE_HEIGHT_MM - 2 * MARGIN_Y_MM;

/** Sticker widths; 20 mm is the default and the unit of the sheet. */
export const STICKER_WIDTHS = [10, 20, 40] as const;
export type StickerWidth = (typeof STICKER_WIDTHS)[number];
export const DEFAULT_STICKER_WIDTH = 20 satisfies StickerWidth;
export const isStickerWidth = (value: unknown): value is StickerWidth =>
	STICKER_WIDTHS.includes(value as StickerWidth);
/** A stored width (10, 20 or 40); anything else reads as the default. */
export const toStickerWidth = (value: number): StickerWidth =>
	isStickerWidth(value) ? value : DEFAULT_STICKER_WIDTH;

/** On a 10 mm sticker the ID goes under the QR, and there is no room for a caption. */
export const idUnderQr = (width: StickerWidth) => width === 10;
/** Widths that carry a caption. */
export const CAPTION_WIDTHS = [20, 40] as const satisfies readonly StickerWidth[];
export type CaptionWidth = (typeof CAPTION_WIDTHS)[number];
export const hasCaption = (width: StickerWidth): width is CaptionWidth => !idUnderQr(width);

/** White border around the sticker's content; the cut lines run along the outer edge. */
export const stickerPadding = (width: StickerWidth) => (idUnderQr(width) ? 0.5 : 1);
/** Stickers per row. */
export const columns = (width: StickerWidth) => ROW_WIDTH_MM / width;

/** The ID under the QR: DejaVu Sans Mono Bold, `K7M-4QX` as wide as the sticker inside its border. */
export const ID_CAP_HEIGHT_EM = 0.729;
/** Advance width of every DejaVu Sans Mono glyph, in em. */
export const ID_ADVANCE_EM = 1233 / 2048;
const ID_CHARS = 7;
/** Space between the QR and the ID under it. */
export const ID_GAP_MM = 0.3;
/** Font size (em) of the ID under the QR, in mm. */
export const idFontMm = (width: StickerWidth) =>
	(width - 2 * stickerPadding(width)) / (ID_CHARS * ID_ADVANCE_EM);

/**
 * Side of the QR: 18 mm on a 20 mm sticker, 38 mm on a 40 mm one. On a 10 mm
 * sticker the QR leaves room for the ID under it (≈7.1 mm).
 */
export const qrSize = (width: StickerWidth) => {
	const inner = width - 2 * stickerPadding(width);
	return idUnderQr(width) ? inner - ID_GAP_MM - ID_CAP_HEIGHT_EM * idFontMm(width) : inner;
};
/** A sticker without a caption is square. */
export const blankHeight = (width: StickerWidth) => width;

/** Caption: DejaVu Sans, wrapped by words into up to CAPTION_MAX_LINES lines as wide as the QR. */
export const CAPTION_FONT_PT = 6.5;
export const CAPTION_MAX_LINES = 3;
const PT_PER_MM = 72 / 25.4;
/** DejaVu Sans line height (ascender − descender), in em. */
const CAPTION_LINE_EM = 1.164;
export const CAPTION_LINE_MM = (CAPTION_FONT_PT * CAPTION_LINE_EM) / PT_PER_MM;
/** Space between the QR and the first caption line. */
export const CAPTION_GAP_MM = 0.3;

/** Upper limit for one batch, to keep a PDF printable in one go. */
export const MAX_SHEETS_PER_BATCH = 20;
/** Blank stickers on a sheet: 28 rows × 20 of 10 mm, 14 × 10 of 20 mm or 7 × 5 of 40 mm. */
export const blanksPerSheet = (width: StickerWidth) =>
	Math.floor(PRINTABLE_HEIGHT_MM / blankHeight(width)) * columns(width);
/** A 40 mm sticker takes the place of four 20 mm ones, a 10 mm one of a quarter. */
const area = (width: StickerWidth) => (width / DEFAULT_STICKER_WIDTH) ** 2;

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

/** Caption line width in points at 1 pt. */
const lineWidthPt = (width: StickerWidth) => (qrSize(width) * PT_PER_MM) / CAPTION_FONT_PT;

export interface WrappedCaption {
	lines: string[];
	/** Part of the caption did not fit and ends with «…». */
	truncated: boolean;
}

/** The longest start of `text` that fits on a line together with `suffix`. */
function longestFit(fits: (text: string) => boolean, text: string, suffix = ''): string {
	let kept = '';
	for (const char of text) {
		if (!fits(kept + char + suffix)) break;
		kept += char;
	}
	return kept;
}

/**
 * Wraps a caption by words into lines as wide as the sticker's QR. A word longer
 * than a line is broken where it reaches the edge. Text that does not fit
 * into CAPTION_MAX_LINES is cut, and the last line ends with «…».
 */
export function wrapCaption(
	caption: string,
	width: StickerWidth = DEFAULT_STICKER_WIDTH
): WrappedCaption {
	const limit = lineWidthPt(width);
	const fits = (text: string) => captionWidthPt(text) <= limit;
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
			const head = longestFit(fits, word) || word.charAt(0);
			lines.push(head);
			word = word.slice(head.length);
		}
		line = word;
	}
	if (line) lines.push(line);
	if (lines.length <= CAPTION_MAX_LINES) return { lines, truncated: false };

	const kept = lines.slice(0, CAPTION_MAX_LINES - 1);
	const last = lines[CAPTION_MAX_LINES - 1] ?? '';
	kept.push(longestFit(fits, last, ELLIPSIS).trimEnd() + ELLIPSIS);
	return { lines: kept, truncated: true };
}

/** Height of a sticker with the given number of caption lines. */
export function stickerHeight(
	captionLines: number,
	width: StickerWidth = DEFAULT_STICKER_WIDTH
): number {
	if (captionLines === 0) return blankHeight(width);
	return blankHeight(width) + CAPTION_GAP_MM + captionLines * CAPTION_LINE_MM;
}

export interface StickerSpec {
	width: StickerWidth;
	caption: string | null;
}

export interface CellPosition {
	/** The sticker in the given list, or null for a blank one added to fill the sheet. */
	index: number | null;
	width: StickerWidth;
	page: number;
	/** Top-left corner of the cell, from the top-left corner of the page. */
	x: number;
	y: number;
	/** Height of the row the cell is in. */
	height: number;
}

export interface SheetRow {
	page: number;
	top: number;
	height: number;
	width: StickerWidth;
}

export interface SheetLayout {
	/** In print order: row by row, left to right. */
	cells: CellPosition[];
	pages: number;
	/** For the cut lines. */
	rows: SheetRow[];
}

/**
 * Places stickers row by row, left to right, in the given order. A row holds
 * stickers of one width: a sticker of another width starts a new row. Every
 * row is as tall as its tallest sticker; a row that does not fit goes to a new
 * page. With `fill`, a row cut short is filled with blank stickers of its
 * width, and the rest of the last page with blank stickers of the last row's
 * width.
 */
export function layoutSheets(stickers: StickerSpec[], fill = false): SheetLayout {
	const cells: CellPosition[] = [];
	const rows: SheetRow[] = [];
	let page = -1;
	let y = Infinity;
	const addRow = (width: StickerWidth, row: { index: number | null; height: number }[]) => {
		if (fill) {
			while (row.length < columns(width)) row.push({ index: null, height: blankHeight(width) });
		}
		const height = Math.max(...row.map((s) => s.height));
		if (y + height > PAGE_HEIGHT_MM - MARGIN_Y_MM + 1e-9) {
			page++;
			y = MARGIN_Y_MM;
		}
		row.forEach(({ index }, column) => {
			cells.push({ index, width, page, x: MARGIN_X_MM + column * width, y, height });
		});
		rows.push({ page, top: y, height, width });
		y += height;
	};

	let row: { index: number | null; height: number }[] = [];
	let width: StickerWidth = DEFAULT_STICKER_WIDTH;
	stickers.forEach((sticker, index) => {
		if (row.length > 0 && (sticker.width !== width || row.length === columns(width))) {
			addRow(width, row);
			row = [];
		}
		width = sticker.width;
		const lines =
			sticker.caption && hasCaption(width) ? wrapCaption(sticker.caption, width).lines.length : 0;
		row.push({ index, height: stickerHeight(lines, width) });
	});
	if (row.length > 0) addRow(width, row);
	if (fill && page >= 0) {
		while (y + blankHeight(width) <= PAGE_HEIGHT_MM - MARGIN_Y_MM + 1e-9) addRow(width, []);
	}
	return { cells, pages: page + 1, rows };
}

/**
 * Print order: wider stickers first (40, 20, then 10 mm), each width keeping the given
 * order. So each width has at most one row cut short, and the rest of a sheet
 * shared by both widths is filled with the small ones.
 */
export function printOrder<T extends { width: StickerWidth }>(stickers: T[]): T[] {
	return stickers
		.map((sticker, i) => ({ sticker, i }))
		.sort((a, b) => b.sticker.width - a.sticker.width || a.i - b.i)
		.map(({ sticker }) => sticker);
}

export type BlankCounts = Partial<Record<StickerWidth, number>>;

export interface SheetPlan {
	sheets: number;
	total: number;
	/** Stickers printed with a caption (a 10 mm one has none, even when ordered for a thing). */
	captioned: number;
	/** Stickers of each width, captioned or not. */
	byWidth: Record<StickerWidth, number>;
	/** Blank stickers added on top of the requested ones to fill the last sheet. */
	padding: number;
	/**
	 * What to print, in print order: the index of a captioned sticker, or null
	 * for a blank one. Empty for a batch too big to print.
	 */
	slots: { index: number | null; width: StickerWidth }[];
}

/**
 * Lays out the captioned stickers and `blanks[width]` blank ones of each width
 * (see printOrder) and, with `fill`, fills cut-short rows and the rest of the
 * last sheet with blank ones: 7 captions + 10 blank → 1 sheet with 7 + 133
 * stickers (without `fill` — 7 + 10).
 */
export function planSheets(
	captioned: { caption: string; width: StickerWidth }[],
	blanks: BlankCounts,
	fill = true
): SheetPlan {
	const blankCount = (width: StickerWidth) => Math.max(0, Math.floor(blanks[width] ?? 0));
	const withCaption = captioned.filter((s) => hasCaption(s.width)).length;
	const byWidth = (count: (width: StickerWidth) => number) =>
		Object.fromEntries(STICKER_WIDTHS.map((w) => [w, count(w)])) as Record<StickerWidth, number>;
	const requested = captioned.length + STICKER_WIDTHS.reduce((n, w) => n + blankCount(w), 0);
	const area20 =
		captioned.reduce((sum, s) => sum + area(s.width), 0) +
		STICKER_WIDTHS.reduce((sum, w) => sum + blankCount(w) * area(w), 0);
	if (area20 > MAX_SHEETS_PER_BATCH * blanksPerSheet(DEFAULT_STICKER_WIDTH)) {
		// Too many for a batch whatever the captions; skip laying out a huge list.
		const sheets = Math.ceil(area20 / blanksPerSheet(DEFAULT_STICKER_WIDTH));
		return {
			sheets,
			total: requested,
			captioned: withCaption,
			byWidth: byWidth((w) => captioned.filter((s) => s.width === w).length + blankCount(w)),
			padding: 0,
			slots: []
		};
	}
	const order = printOrder([
		...captioned.map((s, index) => ({ ...s, index })),
		...STICKER_WIDTHS.flatMap((width) =>
			Array.from({ length: blankCount(width) }, () => ({ width, caption: null, index: null }))
		)
	]);
	const { cells, pages } = layoutSheets(order, fill);
	const slots = cells.map((cell) => ({
		index: cell.index === null ? null : order[cell.index]!.index,
		width: cell.width
	}));
	return {
		sheets: pages,
		total: cells.length,
		captioned: withCaption,
		byWidth: byWidth((w) => cells.filter((cell) => cell.width === w).length),
		padding: cells.length - requested,
		slots
	};
}
