import { apiHandler, parseBody } from '$lib/server/api';
import { profileInputSchema, updateProfile } from '$lib/server/services/profile';

/** «Настройки»: changes the display name. */
export const PATCH = apiHandler(async ({ actor, request }) =>
	updateProfile(actor, await parseBody(request, profileInputSchema))
);
