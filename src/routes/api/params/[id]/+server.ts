import { apiHandler, parseBody } from '$lib/server/api';
import { paramInputSchema } from '$lib/domain/params';
import { deleteParam, updateParam } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

/** A new value of the same parameter. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	updateParam(actor, params.id, await parseBody(request, paramInputSchema))
);

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteParam(actor, params.id);
});
