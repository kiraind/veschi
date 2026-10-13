import { pageLoad } from '$lib/server/api';
import { categoryNotices } from '$lib/server/services/categories';
import { searchExamples, searchWithLimit } from '$lib/server/services/search';
import { searchPlaceholder } from '$lib/domain/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const q = event.url.searchParams.get('q') ?? '';
	const empty = !q.trim();
	const [{ groups, truncated }, examples, notices] = await Promise.all([
		searchWithLimit(actor, q),
		// The placeholder and the notices show only while nothing is typed, so the
		// search that reruns this load on every keystroke skips them.
		empty ? searchExamples(actor) : null,
		empty ? categoryNotices(actor) : null
	]);
	return {
		q,
		groups,
		truncated,
		notices,
		placeholder: examples && searchPlaceholder(examples.names, examples.params)
	};
});
