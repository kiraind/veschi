import { pageLoad } from '$lib/server/api';
import { listWorkbench, listWorkbenches } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const [{ workbenches }, items] = await Promise.all([
		listWorkbenches(actor),
		listWorkbench(actor)
	]);
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.workbenchId, (counts.get(item.workbenchId) ?? 0) + 1);
	return { workbenches: workbenches.map((b) => ({ ...b, itemCount: counts.get(b.id) ?? 0 })) };
});
