import { pageLoad } from '$lib/server/api';
import { listWorkbench, listWorkbenches } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const [{ workbenches }, items] = await Promise.all([
		listWorkbenches(actor),
		listWorkbench(actor)
	]);
	return { workbenches, items };
});
