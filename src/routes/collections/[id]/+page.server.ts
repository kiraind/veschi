import { pageLoad } from '$lib/server/api';
import { getCollectionCard } from '$lib/server/services/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	card: await getCollectionCard(event.actor, event.params.id)
}));
