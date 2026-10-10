import { apiHandler, parseBody } from '$lib/server/api';
import {
	deleteDictionary,
	dictionaryInputSchema,
	getDictionary,
	updateDictionary
} from '$lib/server/services/dictionaries';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getDictionary(actor, params.id)
);

/** Name, single/multiple flag and the full ordered option list. */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) =>
	updateDictionary(actor, params.id, await parseBody(request, dictionaryInputSchema))
);

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteDictionary(actor, params.id);
});
