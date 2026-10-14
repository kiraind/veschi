import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { idSchema } from '$lib/domain/id';
import { DEFAULT_STICKER_WIDTH, STICKER_WIDTHS } from '$lib/domain/sticker-sheet';
import { listStickerOrders, orderSticker } from '$lib/server/services/stickers';

const OrderBody = z.object({
	itemId: idSchema,
	width: z.literal([...STICKER_WIDTHS]).default(DEFAULT_STICKER_WIDTH)
});

export const GET = apiHandler(async ({ actor }) => listStickerOrders(actor));

export const POST = apiHandler(async ({ actor, request }) => {
	const { itemId, width } = await parseBody(request, OrderBody);
	await orderSticker(actor, itemId, width);
});
