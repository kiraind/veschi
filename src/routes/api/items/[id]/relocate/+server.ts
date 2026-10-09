import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { relocate } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

const Body = z.object({ containerId: z.uuid().nullable() });

/** «Положить в другое место»; null = top level. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { containerId } = await parseBody(request, Body);
	await relocate(actor, params.id, containerId);
});
