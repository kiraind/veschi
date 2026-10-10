import { actorOrError } from '$lib/server/api';
import { getParamDef } from '$lib/server/services/params';
import { redirectLegacyId } from '$lib/server/services/legacy';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await redirectLegacyId('ParamDef', event.params.id, (id) => `/params/${id}`);
	return { card: await getParamDef(actorOrError(event), event.params.id) };
};
