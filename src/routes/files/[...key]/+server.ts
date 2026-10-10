import { Readable } from 'node:stream';
import { errorResponse, requireActor } from '$lib/server/api';
import { openFile } from '$lib/server/services/files';
import type { RequestHandler } from './$types';

/** Shown in the browser; anything else (HTML, SVG, scripts…) is downloaded. */
const INLINE_TYPES = new Set([
	'image/webp',
	'image/jpeg',
	'image/png',
	'image/gif',
	'application/pdf',
	'text/plain'
]);

/** Streams a stored photo or parameter file after an ownership check; `?size=thumb` → a photo's thumbnail. */
export const GET: RequestHandler = async (event) => {
	try {
		const actor = requireActor(event);
		const file = await openFile(actor, event.params.key, {
			thumb: event.url.searchParams.get('size') === 'thumb'
		});
		const disposition = INLINE_TYPES.has(file.contentType) ? 'inline' : 'attachment';
		const name = file.fileName ? `; filename*=UTF-8''${encodeURIComponent(file.fileName)}` : '';
		return new Response(Readable.toWeb(file.body) as ReadableStream, {
			headers: {
				'content-type': file.contentType,
				'content-length': String(file.size),
				'content-disposition': disposition + name,
				// Keys are never reused, so the content behind a key never changes.
				'cache-control': 'private, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff',
				'content-security-policy': 'sandbox'
			}
		});
	} catch (e) {
		return errorResponse(e);
	}
};
