import { apiHandler, parseBody } from '$lib/server/api';
import { addTypeToCategory, typeCategoryBodySchema } from '$lib/server/services/categories';
import type { RequestEvent } from './$types';

/** Puts the type into a category: `{ categoryId }`. */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { categoryId } = await parseBody(request, typeCategoryBodySchema);
	await addTypeToCategory(actor, params.id, categoryId);
});
