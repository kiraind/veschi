import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { bindSticker } from '$lib/server/services/stickers';

const BindBody = z.object({ code: z.string(), itemId: z.string() });

/** Returns the stickered record: a new one when the item had several (see bindSticker). */
export const POST = apiHandler(async ({ actor, request }) => {
	const { code, itemId } = await parseBody(request, BindBody);
	return bindSticker(actor, code, itemId);
});
