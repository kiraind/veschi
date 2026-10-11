import { pageLoad } from '$lib/server/api';
import { listCategories } from '$lib/server/services/categories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	categories: await listCategories(event.actor)
}));
