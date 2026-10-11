import { apiHandler, parseBody } from '$lib/server/api';
import { entryInputSchema } from '$lib/domain/collections';
import { addEntry } from '$lib/server/services/collections';
import type { RequestEvent } from './$types';

/** Adds a type or an item (or more of one already there). */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	addEntry(actor, params.id, await parseBody(request, entryInputSchema))
);
