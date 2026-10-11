const BASE = 'http://veschi.invalid';

/**
 * Returns `next` when it is a path on this site, otherwise the fallback
 * (prevents open redirects). Control characters are rejected: browsers drop
 * tabs and newlines from a Location, so `/\t/evil.example` would turn into
 * `//evil.example`.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/'): string {
	// eslint-disable-next-line no-control-regex
	if (!next || !next.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
	try {
		const url = new URL(next, BASE);
		return url.origin === BASE && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
	} catch {
		return fallback;
	}
}
