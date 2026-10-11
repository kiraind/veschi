import { apiHandler, parseBody } from '$lib/server/api';
import { collectionUpdateSchema } from '$lib/domain/collections';
import {
	deleteCollection,
	getCollectionCard,
	updateCollection
} from '$lib/server/services/collections';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getCollectionCard(actor, params.id)
);

export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await updateCollection(actor, params.id, await parseBody(request, collectionUpdateSchema));
});

/** Only the list goes; its types and items stay. */
export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteCollection(actor, params.id);
});
