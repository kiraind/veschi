import { actorOrError } from '$lib/server/api';
import { getParamDef } from '$lib/server/services/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	card: await getParamDef(actorOrError(event), event.params.id)
});
