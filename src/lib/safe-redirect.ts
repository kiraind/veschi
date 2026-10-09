/** Returns `next` when it is a same-site path, otherwise the fallback (prevents open redirects). */
export function safeRedirectPath(next: string | null | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
		return fallback;
	}
	return next;
}
