import { apiHandler } from '$lib/server/api';
import { purge } from '$lib/server/services/archive';
import type { RequestEvent } from './$types';

/** Deletes an archived item for good. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await purge(actor, params.id);
});
