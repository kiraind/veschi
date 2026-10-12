import { pageLoad } from '$lib/server/api';
import { collectionsOf } from '$lib/server/services/collections';
import { getTypeCard } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const id = event.params.id;
	const [card, collections] = await Promise.all([
		getTypeCard(event.actor, id),
		collectionsOf(event.actor, { typeId: id })
	]);
	return { card, collections };
});
