import { apiHandler } from '$lib/server/api';
import { cancelStickerOrder } from '$lib/server/services/stickers';
import type { RequestEvent } from './$types';

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await cancelStickerOrder(actor, params.itemId);
});
