import { actorOrError } from '$lib/server/api';
import { listParamDefs } from '$lib/server/services/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	defs: await listParamDefs(actorOrError(event))
});
