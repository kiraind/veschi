import { apiHandler } from '$lib/server/api';
import { reprocessTypePhoto } from '$lib/server/services/types';
import type { RequestEvent } from './$types';

/** Queues the processing of the photo again. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await reprocessTypePhoto(actor, params.id);
});
