import { pageLoad } from '$lib/server/api';
import { listCollections } from '$lib/server/services/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	collections: await listCollections(event.actor)
}));
