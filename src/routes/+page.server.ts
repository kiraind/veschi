import { pageLoad } from '$lib/server/api';
import { categoryNotices } from '$lib/server/services/categories';
import { searchExamples, searchWithLimit } from '$lib/server/services/search';
import { searchPlaceholder } from '$lib/domain/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const q = event.url.searchParams.get('q') ?? '';
	const [{ groups, truncated }, examples, notices] = await Promise.all([
		searchWithLimit(actor, q),
		searchExamples(actor),
		// Shown only while nothing is typed.
		q.trim() ? null : categoryNotices(actor)
	]);
	return {
		q,
		groups,
		truncated,
		notices,
		placeholder: searchPlaceholder(examples.names, examples.params)
	};
});
