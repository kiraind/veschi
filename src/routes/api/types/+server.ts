import { apiHandler, parseBody } from '$lib/server/api';
import { createType, listTypes, typeInputSchema } from '$lib/server/services/types';

/** All types, or a name filter for autocomplete with `?q=`. */
export const GET = apiHandler(async ({ actor, url }) =>
	listTypes(actor, url.searchParams.get('q') ?? undefined)
);

export const POST = apiHandler(async ({ actor, request }) => {
	const type = await createType(actor, await parseBody(request, typeInputSchema));
	return { id: type.id };
});
