import { apiHandler, parseBody } from '$lib/server/api';
import { collectionInputSchema } from '$lib/domain/collections';
import { createCollection, listCollections } from '$lib/server/services/collections';

export const GET = apiHandler(async ({ actor }) => listCollections(actor));

/** A new collection: name and description; its lines are added on its page. */
export const POST = apiHandler(async ({ actor, request }) =>
	createCollection(actor, await parseBody(request, collectionInputSchema))
);
