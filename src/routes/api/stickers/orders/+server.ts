import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { idSchema } from '$lib/domain/id';
import { listStickerOrders, orderSticker } from '$lib/server/services/stickers';

const OrderBody = z.object({ itemId: idSchema });

export const GET = apiHandler(async ({ actor }) => listStickerOrders(actor));

export const POST = apiHandler(async ({ actor, request }) => {
	const { itemId } = await parseBody(request, OrderBody);
	await orderSticker(actor, itemId);
});
