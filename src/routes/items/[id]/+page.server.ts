import { actorOrError } from '$lib/server/api';
import { getItemCard } from '$lib/server/services/items';
import { redirectLegacyId } from '$lib/server/services/legacy';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await redirectLegacyId('Item', event.params.id, (id) => `/items/${id}`);
	return { card: await getItemCard(actorOrError(event), event.params.id) };
};
