import { apiHandler, parseBody } from '$lib/server/api';
import { paramsBodySchema, setParams } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

/** Replaces the item's own parameter list. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const body = await parseBody(request, paramsBodySchema);
	return setParams(actor, { itemId: params.id }, body.params);
});
