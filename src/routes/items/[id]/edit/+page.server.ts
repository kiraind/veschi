import { error } from '@sveltejs/kit';
import { actorOrError } from '$lib/server/api';
import { getItemCard } from '$lib/server/services/items';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const card = await getItemCard(actorOrError(event), event.params.id);
	if (card.item.isWorkbench) error(400, 'Рабочий стол меняется на странице стола');
	return { card };
};
