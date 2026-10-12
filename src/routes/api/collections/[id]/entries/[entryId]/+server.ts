import { apiHandler, parseBody } from '$lib/server/api';
import { entryUpdateSchema } from '$lib/domain/collections';
import { removeEntry, updateEntry } from '$lib/server/services/collections';
import type { RequestEvent } from './$types';

/** Changes how many the collection needs. */
export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await updateEntry(actor, params.id, params.entryId, await parseBody(request, entryUpdateSchema));
});

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeEntry(actor, params.id, params.entryId);
});
