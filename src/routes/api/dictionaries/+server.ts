import { apiHandler, parseBody } from '$lib/server/api';
import {
	createDictionary,
	dictionaryInputSchema,
	listDictionaries
} from '$lib/server/services/dictionaries';

export const GET = apiHandler(async ({ actor }) => listDictionaries(actor));

export const POST = apiHandler(async ({ actor, request }) =>
	createDictionary(actor, await parseBody(request, dictionaryInputSchema))
);
