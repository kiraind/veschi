import { actorOrError } from '$lib/server/api';
import { search, searchExamples } from '$lib/server/services/search';
import { searchPlaceholder } from '$lib/domain/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const q = event.url.searchParams.get('q') ?? '';
	const [groups, examples] = await Promise.all([
		q.trim() ? search(actor, q) : [],
		searchExamples(actor)
	]);
	return { q, groups, placeholder: searchPlaceholder(examples.names, examples.params) };
};
