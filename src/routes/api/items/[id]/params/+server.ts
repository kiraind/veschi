import { apiHandler, parseBody } from '$lib/server/api';
import { paramInputSchema } from '$lib/domain/params';
import { addParam, paramsBodySchema, setParams } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

/** Replaces the item's own parameter list. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const body = await parseBody(request, paramsBodySchema);
	return setParams(actor, { itemId: params.id }, body.params);
});

/** Adds the value of one more parameter at the end of the list. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	addParam(actor, { itemId: params.id }, await parseBody(request, paramInputSchema))
);
