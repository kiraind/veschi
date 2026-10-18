import { apiHandler, parseBody } from '$lib/server/api';
import { paramDefInputSchema } from '$lib/domain/params';
import { createParamDef, listParamDefs } from '$lib/server/services/param-defs';

export const GET = apiHandler(async ({ actor }) => listParamDefs(actor));

/** A new parameter: name, value type, unit (numbers) or drop-down options (ENUM). */
export const POST = apiHandler(async ({ actor, request }) =>
	createParamDef(actor, await parseBody(request, paramDefInputSchema))
);
