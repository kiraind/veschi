import { actorOrError } from '$lib/server/api';
import { listDictionaries } from '$lib/server/services/dictionaries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	dictionaries: await listDictionaries(actorOrError(event))
});
