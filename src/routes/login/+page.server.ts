import { fail, redirect } from '@sveltejs/kit';
import { authenticate, createSession, setSessionCookie } from '$lib/server/auth/session';
import { loginThrottle } from '$lib/server/auth/throttle';
import { safeRedirectPath } from '$lib/safe-redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirectPath(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const login = String(form.get('login') ?? '');
		const password = String(form.get('password') ?? '');
		// Same normalization as the lookup in `authenticate`, so « admin» counts as «admin».
		const keys = [`login:${login.trim().toLowerCase()}`, `address:${getClientAddress()}`];
		const wait = loginThrottle.attempt(keys);
		if (wait > 0) {
			return fail(429, { login, message: `Слишком много попыток. Попробуйте через ${wait} с` });
		}
		const userId = login && password ? await authenticate(login, password) : null;
		if (!userId) {
			return fail(400, { login, message: 'Неверный логин или пароль' });
		}
		loginThrottle.succeed(keys);
		const session = await createSession(userId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, safeRedirectPath(url.searchParams.get('next')));
	}
};
