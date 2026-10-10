import { z } from 'zod';
import { idSchema } from '$lib/domain/id';
import { apiHandler, parseBody } from '$lib/server/api';
import { take } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

const Body = z.object({
	workbenchId: idSchema,
	quantity: z.number().int().positive().optional()
});

/** «На стол»: the whole item or part of its quantity. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	take(actor, params.id, await parseBody(request, Body))
);
