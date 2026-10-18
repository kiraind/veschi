import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { cancelStickerOrder, setStickerOrderCaption } from '$lib/server/services/stickers';
import type { RequestEvent } from './$types';

const CaptionBody = z.object({ caption: z.string() });

export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { caption } = await parseBody(request, CaptionBody);
	await setStickerOrderCaption(actor, params.itemId, caption);
});

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await cancelStickerOrder(actor, params.itemId);
});
