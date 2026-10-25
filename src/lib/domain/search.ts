/** A search query: free text, plus a key/value pair when written as «ключ: значение». */
export interface SearchQuery {
	text: string;
	param: { key: string; value: string } | null;
}

/**
 * Parses the search box input. «корпус: DIP-8» also yields param {корпус, DIP-8}.
 * Numbers copied as the app shows them («−40», «4 500» with a narrow space)
 * are turned back into the stored form («-40», «4500»).
 */
export function parseSearchQuery(input: string): SearchQuery {
	const text = input
		.replace(/\u2212/g, '-')
		.replace(/(\d)[\u00a0\u2009\u202f](?=\d{3}(?!\d))/g, '$1')
		.trim()
		.replace(/\s+/g, ' ');
	const match = /^([^:]+):(.+)$/.exec(text);
	const key = match?.[1]?.trim();
	const value = match?.[2]?.trim();
	// "https://…" is a URL, not a key "https".
	const param = key && value && !value.startsWith('//') ? { key, value } : null;
	return { text, param };
}

/**
 * Escapes LIKE wildcards so the input is matched literally. Prisma's `equals` and
 * `contains` with `mode: 'insensitive'` become ILIKE without escaping, so names
 * passed to them go through this too.
 */
export function escapeLike(s: string): string {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A LIKE pattern matching the input literally as a substring. */
export function likePattern(s: string): string {
	return `%${escapeLike(s)}%`;
}

/**
 * What a loose comparison drops: spaces, hyphens and dots (but not a decimal point
 * between digits, so «1.5» stays apart from «15»). The same regular expression
 * runs in PostgreSQL (`regexp_replace`), so it uses only syntax both understand.
 */
export const LOOSE_SEPARATORS = '\\s+|[-\u2010\u2011\u2013]+|(?<!\\d)\\.|\\.(?!\\d)';

const LOOSE_RE = new RegExp(LOOSE_SEPARATORS, 'g');

/**
 * Text for comparing part codes regardless of how they are written:
 * «DIP 8», «dip8» and «DIP-8» all become «DIP8» (case is left to ILIKE).
 */
export function looseText(s: string): string {
	return s.replace(LOOSE_RE, '');
}

/** What a loose regular expression allows between two characters, and between two digits (no decimal point). */
const LOOSE_GAP = '[\\s\u2010\u2011\u2013.-]*';
const LOOSE_DIGIT_GAP = '[\\s\u2010\u2011\u2013-]*';

/**
 * A PostgreSQL regular expression body matching `text` loosely, as `looseText`
 * compares: «dip8» matches «DIP-8» and «DIP 8». Anchors are up to the caller.
 */
export function looseRegex(text: string): string {
	const chars = [...looseText(text)];
	return chars
		.map((c, i) => {
			const escaped = c.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
			if (i === 0) return escaped;
			const gap = /\d/.test(chars[i - 1]!) && /\d/.test(c) ? LOOSE_DIGIT_GAP : LOOSE_GAP;
			return gap + escaped;
		})
		.join('');
}

/**
 * Search treats ё and е as the same letter: «ёлка» and «елка» find each other.
 * In SQL the column goes through `translate(…, 'ёЁ', 'еЕ')` (see `foldYoSql`).
 */
export function foldYo(s: string): string {
	return s.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

/** Text for a substring filter in the browser: case, surrounding spaces and ё/е ignored. */
export function searchKey(s: string): string {
	return foldYo(s.trim().toLocaleLowerCase('ru'));
}

/** Longest example that still fits the search field on a phone. */
const MAX_EXAMPLE_LENGTH = 20;

/** Examples for a user who has nothing yet. */
const DEFAULT_NAME = 'NE555';
const DEFAULT_PARAM = { key: 'корпус', value: 'DIP-8' };

/**
 * The search field placeholder: nothing but examples, a name and a «ключ: значение», taken from
 * the user's own types and parameters when there are short enough ones.
 */
export function searchPlaceholder(
	names: string[],
	params: { key: string; value: string }[],
	random: () => number = Math.random
): string {
	const pick = <T>(list: T[]): T | undefined => list[Math.floor(random() * list.length)];
	const name = pick(names.filter((n) => n.length <= MAX_EXAMPLE_LENGTH)) ?? DEFAULT_NAME;
	const param =
		pick(
			params.filter(
				(p) => !p.key.includes(':') && `${p.key}: ${p.value}`.length <= MAX_EXAMPLE_LENGTH
			)
		) ?? DEFAULT_PARAM;
	return `${name} или «${param.key}: ${param.value}»`;
}
