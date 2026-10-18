/**
 * Sticker IDs: 6 characters from a 31-character alphabet without look-alike
 * symbols (0, O, 1, I, L), shown as `XXX-XXX`, stored without the dash in
 * upper case. Input is case-insensitive and the dash is optional.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;
/** New codes differ from every issued code in at least this many positions (FR-11). */
export const MIN_CODE_DISTANCE = 3;

const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;

/**
 * Top-level app routes (a test keeps the list in sync with src/routes). A
 * sticker URL is `/<CODE>`, so a code spelled like a route would be shadowed
 * by it; such codes are never issued (today that is `params`).
 */
export const TOP_LEVEL_ROUTES = [
	'api',
	'archive',
	'barcode',
	'categories',
	'collections',
	'containers',
	'files',
	'healthz',
	'history',
	'items',
	'login',
	'logout',
	'manifest.webmanifest',
	'params',
	'scan',
	'settings',
	'stickers',
	'types',
	'workbench'
];
export const RESERVED_CODES: ReadonlySet<string> = new Set(
	TOP_LEVEL_ROUTES.map((r) => r.toUpperCase()).filter((r) => CODE_RE.test(r))
);

/** Normalizes user input (`k7m-4qx`, ` K7M4QX `) to the stored form (`K7M4QX`), or null if invalid. */
export function normalizeCode(input: string): string | null {
	const code = input.trim().toUpperCase().replace(/[-\s]/g, '');
	return CODE_RE.test(code) ? code : null;
}

/** Shortest piece of a sticker ID that search looks up (shorter ones match too much). */
const MIN_CODE_PART = 3;

/**
 * A query that may be (part of) a sticker ID — `k7m`, `K7M-4QX`, `m4q` — in the
 * stored form, or null when it has characters an ID never contains or is too short.
 */
export function codeQuery(input: string): string | null {
	const part = input.trim().toUpperCase().replace(/[-\s]/g, '');
	if (part.length < MIN_CODE_PART || part.length > CODE_LENGTH) return null;
	return [...part].every((c) => CODE_ALPHABET.includes(c)) ? part : null;
}

/** Stored form → display form: `K7M4QX` → `K7M-4QX`. */
export function formatCode(code: string): string {
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** Number of positions in which two stored-form codes differ. */
export function hammingDistance(a: string, b: string): number {
	let d = 0;
	for (let i = 0; i < CODE_LENGTH; i++) if (a[i] !== b[i]) d++;
	return d;
}

/** All codes that differ from `code` in exactly one position (6 × 30 = 180). */
export function codeNeighbors(code: string): string[] {
	const result: string[] = [];
	for (let i = 0; i < CODE_LENGTH; i++) {
		for (const c of CODE_ALPHABET) {
			if (c !== code[i]) result.push(code.slice(0, i) + c + code.slice(i + 1));
		}
	}
	return result;
}

/** Returns a uniformly random integer in [0, max). */
export type RandomInt = (max: number) => number;

/** Crypto-strong RandomInt (rejection sampling avoids modulo bias). */
export const cryptoRandomInt: RandomInt = (max) => {
	const limit = Math.floor(0x1_0000_0000 / max) * max;
	const buf = new Uint32Array(1);
	for (;;) {
		globalThis.crypto.getRandomValues(buf);
		const value = buf[0]!;
		if (value < limit) return value % max;
	}
};

/**
 * Codes within distance MIN_CODE_DISTANCE - 1 = 2 of each other share at least
 * 4 positions. Indexing every code by each of its 15 four-position projections
 * makes "is there a code within distance 2?" a set lookup instead of a scan.
 */
const PROJECTIONS: number[][] = (() => {
	const result: number[][] = [];
	for (let a = 0; a < CODE_LENGTH; a++) {
		for (let b = a + 1; b < CODE_LENGTH; b++) {
			result.push([...Array(CODE_LENGTH).keys()].filter((i) => i !== a && i !== b));
		}
	}
	return result;
})();

function projectionKeys(code: string): string[] {
	return PROJECTIONS.map((positions, p) => p + ':' + positions.map((i) => code[i]).join(''));
}

/** Attempts per requested code before giving up (the code space is far from full in practice). */
const MAX_ATTEMPTS_PER_CODE = 1000;

/**
 * Generates `count` new codes, each differing from every existing code and
 * from every other new code in at least MIN_CODE_DISTANCE positions, so a
 * single typo never lands on another sticker. Random candidates are rejected
 * via the projection index; reserved codes are skipped.
 */
export function generateCodes(
	existing: Iterable<string>,
	count: number,
	randomInt: RandomInt = cryptoRandomInt
): string[] {
	const index = new Set<string>();
	const add = (code: string) => projectionKeys(code).forEach((k) => index.add(k));
	for (const code of existing) add(code);

	const result: string[] = [];
	let attempts = 0;
	while (result.length < count) {
		if (++attempts > MAX_ATTEMPTS_PER_CODE * count) {
			throw new Error('Не удалось подобрать новые ID наклеек');
		}
		let candidate = '';
		for (let i = 0; i < CODE_LENGTH; i++)
			candidate += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
		if (RESERVED_CODES.has(candidate)) continue;
		if (projectionKeys(candidate).some((k) => index.has(k))) continue;
		add(candidate);
		result.push(candidate);
	}
	return result;
}
