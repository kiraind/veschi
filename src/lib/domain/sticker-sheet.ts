/**
 * Sticker sheet layout (spec «Наклейки»): A4, 6 × 9 = 54 cells of 33 × 31 mm
 * with 6 mm side margins. All sizes are in millimetres.
 */
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const COLUMNS = 6;
export const ROWS = 9;
export const CELL_WIDTH_MM = 33;
export const CELL_HEIGHT_MM = 31;
export const STICKERS_PER_SHEET = COLUMNS * ROWS;
export const MARGIN_X_MM = (PAGE_WIDTH_MM - COLUMNS * CELL_WIDTH_MM) / 2; // 6 mm
export const MARGIN_Y_MM = (PAGE_HEIGHT_MM - ROWS * CELL_HEIGHT_MM) / 2; // 9 mm

/** Captions longer than this do not fit on one line; the form warns, the PDF truncates. */
export const CAPTION_MAX_LENGTH = 16;
/** Upper limit for one batch, to keep a PDF printable in one go. */
export const MAX_SHEETS_PER_BATCH = 20;

/** One caption per non-empty line, trimmed. */
export function parseCaptions(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export interface SheetPlan {
	sheets: number;
	total: number;
	captioned: number;
	/** Blank stickers added on top of the requested ones to fill the last sheet. */
	padding: number;
}

/**
 * Rounds the requested stickers up to whole sheets and fills the rest with
 * blank ones: 7 captions + 10 blank → 1 sheet, 54 stickers, 37 padding.
 */
export function planSheets(captionCount: number, blankCount: number): SheetPlan {
	const requested = captionCount + blankCount;
	const sheets = Math.ceil(requested / STICKERS_PER_SHEET);
	const total = sheets * STICKERS_PER_SHEET;
	return { sheets, total, captioned: captionCount, padding: total - requested };
}

export interface CellPosition {
	page: number;
	/** Top-left corner of the cell, from the top-left corner of the page. */
	x: number;
	y: number;
}

/** Where the sticker with the given print-order index lies (row by row, left to right). */
export function cellPosition(index: number): CellPosition {
	const page = Math.floor(index / STICKERS_PER_SHEET);
	const onPage = index % STICKERS_PER_SHEET;
	const column = onPage % COLUMNS;
	const row = Math.floor(onPage / COLUMNS);
	return {
		page,
		x: MARGIN_X_MM + column * CELL_WIDTH_MM,
		y: MARGIN_Y_MM + row * CELL_HEIGHT_MM
	};
}

export function isCaptionTooLong(caption: string): boolean {
	return [...caption].length > CAPTION_MAX_LENGTH;
}

/** Cuts a caption to CAPTION_MAX_LENGTH characters, ending with «…» when shortened. */
export function truncateCaption(caption: string): string {
	const chars = [...caption];
	if (chars.length <= CAPTION_MAX_LENGTH) return caption;
	return chars.slice(0, CAPTION_MAX_LENGTH - 1).join('') + '…';
}
