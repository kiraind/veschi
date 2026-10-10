import { apiHandler, parseBody } from '$lib/server/api';
import { paramDefInputSchema } from '$lib/domain/params';
import { createParamDef, listParamDefs } from '$lib/server/services/params';

export const GET = apiHandler(async ({ actor }) => listParamDefs(actor));

/** A new parameter: name, value type and, for ENUM, its drop-down list. */
export const POST = apiHandler(async ({ actor, request }) =>
	createParamDef(actor, await parseBody(request, paramDefInputSchema))
);
