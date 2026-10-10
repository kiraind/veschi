import { apiHandler } from '$lib/server/api';
import { unprintBatch } from '$lib/server/services/stickers';
import type { RequestEvent } from './$types';

/** «Не распечатано»: deletes the batch and frees its sticker IDs. */
export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await unprintBatch(actor, params.id);
});
