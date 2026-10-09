import { apiHandler, parseBody } from '$lib/server/api';
import { deleteWorkbench, updateWorkbench } from '$lib/server/services/workbench';
import { WorkbenchBody } from '../schema';
import type { RequestEvent } from './$types';

export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	updateWorkbench(actor, params.id, await parseBody(request, WorkbenchBody))
);

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteWorkbench(actor, params.id);
});
