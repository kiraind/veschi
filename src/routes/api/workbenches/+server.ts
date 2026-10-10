import { apiHandler, parseBody } from '$lib/server/api';
import { createWorkbench, listWorkbenches } from '$lib/server/services/workbench';
import { WorkbenchBody } from './schema';

/** Benches plus the last used one (for client-side selection, see pickWorkbench). */
export const GET = apiHandler(async ({ actor }) => listWorkbenches(actor));

export const POST = apiHandler(async ({ actor, request }) =>
	createWorkbench(actor, await parseBody(request, WorkbenchBody))
);
