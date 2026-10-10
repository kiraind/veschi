import { actorOrError } from '$lib/server/api';
import { getTypeCard } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	card: await getTypeCard(actorOrError(event), event.params.id)
});
