import { apiHandler, parseBody } from '$lib/server/api';
import { paramsBodySchema, setParams } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

/** Replaces the type's parameter list (shown on every item of the type). */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const body = await parseBody(request, paramsBodySchema);
	return setParams(actor, { typeId: params.id }, body.params);
});
