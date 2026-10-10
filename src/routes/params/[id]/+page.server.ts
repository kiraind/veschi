import { actorOrError } from '$lib/server/api';
import { listDictionaries } from '$lib/server/services/dictionaries';
import { getParamDef } from '$lib/server/services/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const [card, dictionaries] = await Promise.all([
		getParamDef(actor, event.params.id),
		listDictionaries(actor)
	]);
	return { card, dictionaries };
};
