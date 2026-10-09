/**
 * Sticker IDs: 6 characters from a 31-character alphabet without look-alike
 * symbols (0, O, 1, I, L), shown as `XXX-XXX`, stored without the dash in
 * upper case. Input is case-insensitive and the dash is optional.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;

/** Normalizes user input (`k7m-4qx`, ` K7M4QX `) to the stored form (`K7M4QX`), or null if invalid. */
export function normalizeCode(input: string): string | null {
	const code = input.trim().toUpperCase().replace(/[-\s]/g, '');
	return CODE_RE.test(code) ? code : null;
}

/** Stored form → display form: `K7M4QX` → `K7M-4QX`. */
export function formatCode(code: string): string {
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** True when the string is a stored-form code (also used as the SvelteKit param matcher). */
export function isCode(value: string): boolean {
	return CODE_RE.test(value.toUpperCase());
}
