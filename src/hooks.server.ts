import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { errorResponse } from '$lib/server/api';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	setSessionCookie,
	validateSession
} from '$lib/server/auth/session';
import { UnauthorizedError } from '$lib/server/errors';
import { initApp } from '$lib/server/init';

export const init: ServerInit = async () => {
	if (!building) await initApp();
};

/** Routes reachable without signing in. */
const PUBLIC_PATHS = ['/login', '/healthz'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** API endpoints and files answer 401 instead of redirecting to the login page. */
function isApi(pathname: string): boolean {
	return pathname.startsWith('/api/') || pathname.startsWith('/files/');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.actor = null;
	event.locals.sessionId = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSession(token);
		if (session) {
			const { user } = session;
			event.locals.user = { id: user.id, login: user.login, name: user.name };
			event.locals.actor = { userId: user.id, householdIds: user.householdIds };
			event.locals.sessionId = session.sessionId;
			setSessionCookie(event.cookies, token, session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	const { pathname, search } = event.url;
	if (!event.locals.user && !isPublic(pathname)) {
		if (isApi(pathname)) return errorResponse(new UnauthorizedError());
		redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
	}

	return resolve(event);
};
