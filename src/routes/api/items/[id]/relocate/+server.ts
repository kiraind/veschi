import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { relocate } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

const Body = z.object({
	containerId: z.uuid().nullable(),
	quantity: z.number().int().positive().optional()
});

/** «Положить в другое место»: the whole item or part of its quantity; null = top level. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { containerId, quantity } = await parseBody(request, Body);
	return relocate(actor, params.id, containerId, { quantity });
});
