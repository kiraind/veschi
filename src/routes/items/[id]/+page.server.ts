import { pageLoad } from '$lib/server/api';
import { getItemCard } from '$lib/server/services/items';
import { listWorkbench } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

/** The card; an item on a workbench also gets where «Вернуть» puts it. */
export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const card = await getItemCard(actor, event.params.id);
	const onBench =
		card.item.takenById && card.item.status === 'ACTIVE'
			? ((await listWorkbench(actor, { itemId: card.item.id }))[0] ?? null)
			: null;
	return { card, onBench };
});
