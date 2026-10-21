/** Text worth compressing: pages, `__data.json`, API answers. Photos are compressed already. */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml)/;
/** Smaller bodies gain less than the gzip header costs. */
const MIN_SIZE = 1024;

/**
 * Gzips a page or JSON answer when the browser accepts it. The Node server of
 * SvelteKit compresses only its static files, and an item page with its
 * contents is tens of kilobytes of HTML. A proxy in front sees
 * `content-encoding` and does not compress again.
 */
export function compress(request: Request, response: Response): Response {
	if (!response.body || request.method === 'HEAD') return response;
	if (response.headers.has('content-encoding')) return response;
	if (!COMPRESSIBLE.test(response.headers.get('content-type') ?? '')) return response;
	const length = response.headers.get('content-length');
	if (length !== null && Number(length) < MIN_SIZE) return response;
	if (!/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) return response;

	const headers = new Headers(response.headers);
	headers.delete('content-length');
	headers.set('content-encoding', 'gzip');
	headers.append('vary', 'accept-encoding');
	// A strong ETag promises these exact bytes; the gzipped body is a different set.
	const etag = headers.get('etag');
	if (etag?.startsWith('"')) headers.set('etag', `W/${etag}`);
	return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
