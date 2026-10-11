import { pageLoad } from '$lib/server/api';
import { listContents } from '$lib/server/services/items';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	items: await listContents(event.actor, null)
}));
