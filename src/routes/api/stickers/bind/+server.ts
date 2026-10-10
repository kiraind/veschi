import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { bindSticker } from '$lib/server/services/stickers';

const BindBody = z.object({ code: z.string(), itemId: z.string() });

export const POST = apiHandler(async ({ actor, request }) => {
	const { code, itemId } = await parseBody(request, BindBody);
	await bindSticker(actor, code, itemId);
});
