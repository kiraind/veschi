import { actorOrError } from '$lib/server/api';
import { listDictionaries } from '$lib/server/services/dictionaries';
import { listParamDefs } from '$lib/server/services/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const [defs, dictionaries] = await Promise.all([listParamDefs(actor), listDictionaries(actor)]);
	return { defs, dictionaries };
};
