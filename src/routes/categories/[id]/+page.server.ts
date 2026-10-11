import { actorOrError } from '$lib/server/api';
import { getCategoryCard } from '$lib/server/services/categories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	card: await getCategoryCard(actorOrError(event), event.params.id)
});
