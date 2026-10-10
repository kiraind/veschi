import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { returnHome } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

const Body = z.object({ quantity: z.number().int().positive().optional() });

/** «Вернуть на место»: the whole item (empty body) or part of its quantity. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const options = request.headers.get('content-type')?.includes('application/json')
		? await parseBody(request, Body)
		: {};
	return returnHome(actor, params.id, options);
});
