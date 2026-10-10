import { actorOrError } from '$lib/server/api';
import { parseHistoryFilters } from '$lib/domain/history';
import { describeEntity, listHistory, listHistoryActors } from '$lib/server/services/history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const filters = parseHistoryFilters(event.url.searchParams);
	const [page, actors, entity] = await Promise.all([
		listHistory(actor, filters),
		listHistoryActors(actor),
		filters.entity ? describeEntity(actor, filters.entity) : null
	]);
	return { filters, page, actors, entity };
};
