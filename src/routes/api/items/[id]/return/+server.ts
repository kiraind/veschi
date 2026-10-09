import { apiHandler } from '$lib/server/api';
import { returnHome } from '$lib/server/services/workbench';
import type { RequestEvent } from './$types';

/** «Вернуть на место». */
export const POST = apiHandler<RequestEvent>(async ({ actor, params }) =>
	returnHome(actor, params.id)
);
