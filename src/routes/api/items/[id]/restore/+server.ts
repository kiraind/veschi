import { apiHandler } from '$lib/server/api';
import { restore } from '$lib/server/services/archive';
import type { RequestEvent } from './$types';

/** Brings an item back from the archive. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await restore(actor, params.id);
});
