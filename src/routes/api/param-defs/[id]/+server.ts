import { apiHandler, parseBody } from '$lib/server/api';
import { paramDefInputSchema } from '$lib/domain/params';
import { deleteParamDef, getParamDef, updateParamDef } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getParamDef(actor, params.id)
);

/** Name, unit and drop-down options; the value type only while the parameter has no values. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	updateParamDef(actor, params.id, await parseBody(request, paramDefInputSchema))
);

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteParamDef(actor, params.id);
});
