import { apiHandler, parseBody } from '$lib/server/api';
import { categoryParamsBodySchema, setCategoryParams } from '$lib/server/services/categories';
import type { RequestEvent } from './$types';

/** The whole list of required parameters: `{ params: [{ defId, level: 'TYPE' | 'ITEM' }] }`. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const body = await parseBody(request, categoryParamsBodySchema);
	return setCategoryParams(actor, params.id, body.params);
});
