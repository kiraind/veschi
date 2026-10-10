import { apiHandler, parseBody } from '$lib/server/api';
import { moveItem, moveItemSchema } from '$lib/server/services/items';
import type { RequestEvent } from './$types';

/** «Переложить»: into another container, or to the top level with parentId = null. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { parentId } = await parseBody(request, moveItemSchema);
	await moveItem(actor, params.id, parentId);
});
