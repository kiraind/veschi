import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { consume } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

const Body = z.object({ quantity: z.number().int().positive() });

/** «Использовать»: reduce the quantity; all of it → archive. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { quantity } = await parseBody(request, Body);
	return consume(actor, params.id, quantity);
});
