import { apiHandler, parseBody } from '$lib/server/api';
import { categoryUpdateSchema } from '$lib/domain/categories';
import { deleteCategory, getCategoryCard, updateCategory } from '$lib/server/services/categories';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) =>
	getCategoryCard(actor, params.id)
);

export const PATCH = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	await updateCategory(actor, params.id, await parseBody(request, categoryUpdateSchema));
});

/** Its types stay, without its requirements. */
export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await deleteCategory(actor, params.id);
});
