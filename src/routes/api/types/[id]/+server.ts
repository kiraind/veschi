import { apiHandler, parseBody } from '$lib/server/api';
import { deleteType, getTypeCard, typeUpdateSchema, updateType } from '$lib/server/services/types';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getTypeCard(actor, params.id)
);

export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await updateType(actor, params.id, await parseBody(request, typeUpdateSchema));
});

/** Only a type nothing refers to can be deleted. */
export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteType(actor, params.id);
});
