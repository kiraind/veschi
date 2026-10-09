import { actorOrError } from '$lib/server/api';
import { search } from '$lib/server/services/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const q = event.url.searchParams.get('q') ?? '';
	return { q, groups: q.trim() ? await search(actor, q) : [] };
};
