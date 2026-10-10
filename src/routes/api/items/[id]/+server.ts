import { apiHandler, parseBody } from '$lib/server/api';
import { getItemCard, updateItem, updateItemSchema } from '$lib/server/services/items';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getItemCard(actor, params.id)
);

export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await updateItem(actor, params.id, await parseBody(request, updateItemSchema));
});
