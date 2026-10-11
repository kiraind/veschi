import { apiHandler, parseBody } from '$lib/server/api';
import { categoryInputSchema } from '$lib/domain/categories';
import { createCategory, listCategories } from '$lib/server/services/categories';

export const GET = apiHandler(async ({ actor }) => listCategories(actor));

/** A new category: name and description; required parameters are set on its page. */
export const POST = apiHandler(async ({ actor, request }) =>
	createCategory(actor, await parseBody(request, categoryInputSchema))
);
