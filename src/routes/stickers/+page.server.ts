import { pageLoad } from '$lib/server/api';
import { listBatches, listStickerOrders } from '$lib/server/services/stickers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const [batches, orders] = await Promise.all([listBatches(actor), listStickerOrders(actor)]);
	return { batches, orders };
});
