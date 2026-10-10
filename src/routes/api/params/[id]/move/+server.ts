import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { moveParam } from '$lib/server/services/params';
import type { RequestEvent } from './$types';

const Body = z.object({ delta: z.union([z.literal(-1), z.literal(1)]) });

/** One place up (-1) or down (+1) in its list. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { delta } = await parseBody(request, Body);
	await moveParam(actor, params.id, delta);
});
