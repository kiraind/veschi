/**
 * Short forms of long values for display (the full value goes to `title`).
 * File names keep their beginning, the end and the extension; links keep the
 * beginning with the whole domain.
 */

const ELLIPSIS = '…';

/** «Очень_длинная_инструкция_к_паяльнику.pdf» → «Очень_длинная_инс…ьнику.pdf». */
export function shortenFileName(name: string, max = 32): string {
	if (name.length <= max) return name;
	const dot = name.lastIndexOf('.');
	// An extension is a short tail after the last dot («.pdf», «.tar.gz» keeps «.gz»).
	const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
	const base = ext ? name.slice(0, dot) : name;
	const tail = base.slice(-Math.min(6, Math.max(0, base.length - 1))) + ext;
	const head = Math.max(1, max - 1 - tail.length);
	return name.slice(0, head) + ELLIPSIS + tail;
}

/**
 * «https://www.example.com/catalog/very/long/path?x=1» → «www.example.com/catalog/ve…»:
 * the scheme is dropped, the domain is always whole.
 */
export function shortenUrl(url: string, max = 40): string {
	const shown = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
	if (shown.length <= max) return shown;
	const hostEnd = shown.search(/[/?#]/);
	const host = hostEnd === -1 ? shown : shown.slice(0, hostEnd);
	return shown.slice(0, Math.max(host.length, max - 1)) + ELLIPSIS;
}
