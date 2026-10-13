import { pageLoad } from '$lib/server/api';
import { collectionsOf } from '$lib/server/services/collections';
import { getItemCard } from '$lib/server/services/items';
import { listWorkbench } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

/** The card; an item on a workbench also gets where «Вернуть» puts it. */
export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const id = event.params.id;
	// Independent reads in parallel. listWorkbench finds the item only while it is
	// taken and active; an unknown or foreign id finds nothing and getItemCard throws.
	const [card, bench, collections] = await Promise.all([
		getItemCard(actor, id),
		listWorkbench(actor, { itemId: id }),
		collectionsOf(actor, { itemId: id })
	]);
	return {
		card,
		onBench: bench[0] ?? null,
		collections: card.item.isWorkbench ? [] : collections
	};
});
