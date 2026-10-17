import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { readUpload } from '$lib/server/services/files';
import {
	getPhotoState,
	removeTypePhoto,
	setPhotoChoice,
	setTypePhoto
} from '$lib/server/services/types';
import type { RequestEvent } from './$types';

/** The versions of the photo and its processing (null without a photo). */
export const GET = apiHandler<RequestEvent>(async ({ actor, params }) => ({
	photo: await getPhotoState(actor, params.id)
}));

/** Multipart field `file`; the photo replaces the previous one. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const file = await readUpload(request);
	return { photoKey: await setTypePhoto(actor, params.id, file.data) };
});

/** Which version is shown. */
export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { choice } = await parseBody(
		request,
		z.object({ choice: z.enum(['AUTO', 'ORIGINAL', 'CUTOUT']) })
	);
	await setPhotoChoice(actor, params.id, choice);
});

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeTypePhoto(actor, params.id);
});
