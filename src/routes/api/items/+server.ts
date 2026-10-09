import { apiHandler, parseBody } from '$lib/server/api';
import { createItem, createItemSchema, listContents } from '$lib/server/services/items';

/** Contents of a container (`?parent=<id>`) or the top level (no parameter). */
export const GET = apiHandler(async ({ actor, url }) =>
	listContents(actor, url.searchParams.get('parent') || null)
);

export const POST = apiHandler(async ({ actor, request }) =>
	createItem(actor, await parseBody(request, createItemSchema))
);
