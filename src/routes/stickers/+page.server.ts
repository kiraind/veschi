import { actorOrError } from '$lib/server/api';
import { listBatches } from '$lib/server/services/stickers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	batches: await listBatches(actorOrError(event))
});
