import { actorOrError } from '$lib/server/api';
import { getTypeCard } from '$lib/server/services/types';
import { redirectLegacyId } from '$lib/server/services/legacy';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await redirectLegacyId('ItemType', event.params.id, (id) => `/types/${id}`);
	return { card: await getTypeCard(actorOrError(event), event.params.id) };
};
