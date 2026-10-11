import { apiHandler } from '$lib/server/api';
import { removeTypeFromCategory } from '$lib/server/services/categories';
import type { RequestEvent } from './$types';

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeTypeFromCategory(actor, params.id, params.categoryId);
});
