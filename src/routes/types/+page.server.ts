import { pageLoad } from '$lib/server/api';
import { listTypes } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	types: await listTypes(event.actor)
}));
