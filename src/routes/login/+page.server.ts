import { fail, redirect } from '@sveltejs/kit';
import { authenticate, createSession, setSessionCookie } from '$lib/server/auth/session';
import { safeRedirectPath } from '$lib/safe-redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirectPath(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const login = String(form.get('login') ?? '');
		const password = String(form.get('password') ?? '');
		const userId = login && password ? await authenticate(login, password) : null;
		if (!userId) {
			return fail(400, { login, message: 'Неверный логин или пароль' });
		}
		const session = await createSession(userId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, safeRedirectPath(url.searchParams.get('next')));
	}
};
