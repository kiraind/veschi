import { apiHandler } from '$lib/server/api';
import { resolveCode } from '$lib/server/services/stickers';

export const GET = apiHandler(async ({ actor, url }) =>
	resolveCode(actor, url.searchParams.get('code') ?? '')
);
