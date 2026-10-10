import { apiHandler, parseBody } from '$lib/server/api';
import { paramInputSchema } from '$lib/domain/params';
import { addParam, paramsBodySchema, setParams } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

/** Replaces the type's parameter list (shown on every item of the type). */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const body = await parseBody(request, paramsBodySchema);
	return setParams(actor, { typeId: params.id }, body.params);
});

/** Adds the value of one more parameter at the end of the list. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	addParam(actor, { typeId: params.id }, await parseBody(request, paramInputSchema))
);
