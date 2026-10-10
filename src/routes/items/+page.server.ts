import { actorOrError } from '$lib/server/api';
import { listContents } from '$lib/server/services/items';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	items: await listContents(actorOrError(event), null)
});
