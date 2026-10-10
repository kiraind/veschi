import { actorOrError } from '$lib/server/api';
import { listCategories } from '$lib/server/services/categories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	categories: await listCategories(actorOrError(event))
});
