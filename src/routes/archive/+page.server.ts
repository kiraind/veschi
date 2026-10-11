import { pageLoad } from '$lib/server/api';
import { listArchive } from '$lib/server/services/archive';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	items: await listArchive(event.actor)
}));
