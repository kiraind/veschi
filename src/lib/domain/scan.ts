import { normalizeCode } from './sticker-code';

/**
 * Extracts a sticker code from scanned or typed text: a bare code
 * (`k7m-4qx`) or a URL with any domain whose last path segment is a code
 * (`HTTPS://V.EX.IO/K7M4QX`). Returns the stored form or null.
 */
export function extractCode(text: string): string | null {
	const withoutQuery = text.trim().replace(/[?#].*$/s, '');
	const segments = withoutQuery.split('/').filter((s) => s.length > 0);
	const last = segments.at(-1);
	return last ? normalizeCode(last) : null;
}
