import { actorOrError } from '$lib/server/api';
import { listBatches, listStickerOrders } from '$lib/server/services/stickers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const [batches, orders] = await Promise.all([listBatches(actor), listStickerOrders(actor)]);
	return { batches, orders };
};
