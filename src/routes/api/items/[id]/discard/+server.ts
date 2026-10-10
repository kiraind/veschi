import { z } from 'zod';
import { idSchema } from '$lib/domain/id';
import { apiHandler, parseBody } from '$lib/server/api';
import { discard } from '$lib/server/services/archive';
import type { RequestEvent } from './$types';

const Body = z.object({
	contents: z.enum(['parent', 'workbench', 'discard']).optional(),
	workbenchId: idSchema.optional()
});

/** «Выкинуть»: to the archive; a container's contents go where chosen. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await discard(actor, params.id, await parseBody(request, Body));
});
