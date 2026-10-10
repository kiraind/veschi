import { apiHandler } from '$lib/server/api';
import { parseHistoryFilters } from '$lib/domain/history';
import { listHistory } from '$lib/server/services/history';

/** A page of history: the /history filters plus `before` (cursor of the previous page). */
export const GET = apiHandler(async ({ actor, url }) =>
	listHistory(actor, parseHistoryFilters(url.searchParams), url.searchParams.get('before'))
);
