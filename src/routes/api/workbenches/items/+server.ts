import { z } from 'zod';
import { apiHandler } from '$lib/server/api';
import { listWorkbench } from '$lib/server/services/workbench';

/** Items on workbenches; ?workbenchId= narrows to one bench. */
export const GET = apiHandler(async ({ actor, url }) => {
	const workbenchId = z
		.uuid()
		.optional()
		.parse(url.searchParams.get('workbenchId') ?? undefined);
	return listWorkbench(actor, workbenchId);
});
