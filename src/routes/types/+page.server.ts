import { actorOrError } from '$lib/server/api';
import { listTypes } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	types: await listTypes(actorOrError(event))
});
