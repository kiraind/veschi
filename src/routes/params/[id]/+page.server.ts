import { pageLoad } from '$lib/server/api';
import { getParamDef } from '$lib/server/services/param-defs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = pageLoad(async (event) => ({
	card: await getParamDef(event.actor, event.params.id)
}));
