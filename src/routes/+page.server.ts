import { pageLoad } from '$lib/server/api';
import { searchExamples, searchWithLimit } from '$lib/server/services/search';
import { searchPlaceholder } from '$lib/domain/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const q = event.url.searchParams.get('q') ?? '';
	const [{ groups, truncated }, examples] = await Promise.all([
		searchWithLimit(actor, q),
		searchExamples(actor)
	]);
	return { q, groups, truncated, placeholder: searchPlaceholder(examples.names, examples.params) };
});
