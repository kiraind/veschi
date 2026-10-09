import { actorOrError } from '$lib/server/api';
import { listWorkbench, listWorkbenches } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const [{ workbenches }, items] = await Promise.all([
		listWorkbenches(actor),
		listWorkbench(actor)
	]);
	return { workbenches, items };
};
