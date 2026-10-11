import { pageLoad } from '$lib/server/api';
import { getTypeCard } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	card: await getTypeCard(event.actor, event.params.id)
}));
