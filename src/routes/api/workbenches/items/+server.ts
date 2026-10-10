import { idSchema } from '$lib/domain/id';
import { apiHandler } from '$lib/server/api';
import { listWorkbench } from '$lib/server/services/workbench';

/** Items on workbenches; ?workbenchId= narrows to one bench. */
export const GET = apiHandler(async ({ actor, url }) => {
	const workbenchId = idSchema.optional().parse(url.searchParams.get('workbenchId') ?? undefined);
	return listWorkbench(actor, workbenchId);
});
