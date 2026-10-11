import { redirect } from '@sveltejs/kit';
import { pageLoad } from '$lib/server/api';
import { resolveCode } from '$lib/server/services/stickers';
import type { PageServerLoad } from './$types';

/** A sticker URL (`/K7M4QX`, any case): open the item, create one for a free sticker, or explain. */
export const load: PageServerLoad = pageLoad(async (event) => {
	const result = await resolveCode(event.actor, event.params.code);
	if (result.status === 'bound') redirect(303, `/items/${result.itemId}`);
	if (result.status === 'free') redirect(303, `/items/new?sticker=${result.code}`);
	return { result };
});
