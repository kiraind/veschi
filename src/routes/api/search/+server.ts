import { apiHandler } from '$lib/server/api';
import { search } from '$lib/server/services/search';

export const GET = apiHandler(async ({ actor, url }) =>
	search(actor, url.searchParams.get('q') ?? '')
);
