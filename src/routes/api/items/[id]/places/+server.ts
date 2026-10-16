import { apiHandler } from '$lib/server/api';
import { suggestPlaces } from '$lib/server/services/places';
import type { RequestEvent } from './$types';

/** Where to move the item: recent places and neighbouring containers (see suggestPlaces). */
export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	suggestPlaces(actor, params.id)
);
