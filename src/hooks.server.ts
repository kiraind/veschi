import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { errorResponse } from '$lib/server/api';
import { compress } from '$lib/server/compress';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	setSessionCookie,
	validateSession
} from '$lib/server/auth/session';
import { ForbiddenError, UnauthorizedError } from '$lib/server/errors';
import { initApp } from '$lib/server/init';
import { THEME_COOKIE, parseTheme } from '$lib/domain/theme';

export const init: ServerInit = async () => {
	if (!building) await initApp();
};

/** Routes reachable without signing in. */
const PUBLIC_PATHS = ['/login', '/healthz'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * A change sent from another site. SvelteKit checks the Origin of form posts
 * only; a JSON or bodiless request (POST …/purge) is checked here. Browsers
 * send Origin with every such request, so a missing one is not a browser.
 */
function isCrossSiteChange(request: Request, url: URL): boolean {
	if (request.method === 'GET' || request.method === 'HEAD') return false;
	const origin = request.headers.get('origin');
	return origin !== null && origin !== url.origin;
}

/** API endpoints and files answer 401 instead of redirecting to the login page. */
function isApi(pathname: string): boolean {
	return pathname.startsWith('/api/') || pathname.startsWith('/files/');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.actor = null;
	event.locals.sessionId = null;

	if (isCrossSiteChange(event.request, event.url)) {
		return errorResponse(new ForbiddenError('Запрос с другого сайта отклонён'));
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSession(token);
		if (session) {
			const { user } = session;
			event.locals.user = { id: user.id, login: user.login, name: user.name };
			event.locals.actor = { userId: user.id, householdIds: user.householdIds };
			event.locals.sessionId = session.sessionId;
			// The cookie expires with the session, so it is sent again only when that moves.
			if (session.renewed) setSessionCookie(event.cookies, token, session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	const { pathname, search } = event.url;
	if (!event.locals.user && !isPublic(pathname)) {
		if (isApi(pathname)) return errorResponse(new UnauthorizedError());
		redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
	}

	// The theme from «Настройки» goes into <html> so the page is rendered in it (app.html).
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%theme%', theme).replace('%theme-class%', theme === 'dark' ? 'dark' : '')
	});
	// A server-side fetch of the app itself reads the body as is.
	return event.isSubRequest ? response : compress(event.request, response);
};
