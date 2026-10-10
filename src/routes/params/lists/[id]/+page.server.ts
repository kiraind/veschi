import { actorOrError } from '$lib/server/api';
import { getDictionary } from '$lib/server/services/dictionaries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	dictionary: await getDictionary(actorOrError(event), event.params.id)
});
