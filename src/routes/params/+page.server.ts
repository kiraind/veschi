import { pageLoad } from '$lib/server/api';
import { listParamDefs } from '$lib/server/services/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	defs: await listParamDefs(event.actor)
}));
