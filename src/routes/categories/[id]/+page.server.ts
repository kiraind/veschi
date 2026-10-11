import { pageLoad } from '$lib/server/api';
import { getCategoryCard } from '$lib/server/services/categories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	card: await getCategoryCard(event.actor, event.params.id)
}));
