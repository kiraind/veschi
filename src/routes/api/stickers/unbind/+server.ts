import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { unbindSticker } from '$lib/server/services/stickers';

const UnbindBody = z.object({ itemId: z.string() });

export const POST = apiHandler(async ({ actor, request }) => {
	const { itemId } = await parseBody(request, UnbindBody);
	await unbindSticker(actor, itemId);
});
