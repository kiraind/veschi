import { actorOrError } from '$lib/server/api';
import { getItemCard } from '$lib/server/services/items';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	card: await getItemCard(actorOrError(event), event.params.id)
});
