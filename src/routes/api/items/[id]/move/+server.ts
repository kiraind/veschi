import { apiHandler, parseBody } from '$lib/server/api';
import { moveItem, moveItemSchema } from '$lib/server/services/items';
import type { RequestEvent } from './$types';

/**
 * «Переложить»: the whole item or part of its quantity into another container,
 * or to the top level with parentId = null. Returns the id of the moved record.
 */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { parentId, quantity } = await parseBody(request, moveItemSchema);
	return moveItem(actor, params.id, parentId, { quantity });
});
