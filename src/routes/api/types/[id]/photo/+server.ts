import { apiHandler } from '$lib/server/api';
import { readUpload } from '$lib/server/services/files';
import { removeTypePhoto, setTypePhoto } from '$lib/server/services/types';
import type { RequestEvent } from './$types';

/** Multipart field `file`; the photo replaces the previous one. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const file = await readUpload(request);
	return { photoKey: await setTypePhoto(actor, params.id, file.data) };
});

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeTypePhoto(actor, params.id);
});
