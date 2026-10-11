import { isRedirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, createSession } from '$lib/server/auth/session';
import { createTestActor } from '$lib/server/testing/db';
import { handle } from './hooks.server';

/** A minimal request event: cookie jar, URL and empty locals. */
function fakeEvent(
	path: string,
	cookies: Record<string, string> = {},
	init: RequestInit = {}
): RequestEvent {
	const jar = new Map(Object.entries(cookies));
	const cookieApi: Partial<Cookies> = {
		get: (name) => jar.get(name),
		set: (name, value) => void jar.set(name, value),
		delete: (name) => void jar.delete(name)
	};
	const url = new URL(path, 'http://localhost');
	return {
		url,
		request: new Request(url, init),
		cookies: cookieApi,
		locals: {}
	} as unknown as RequestEvent;
}

async function run(event: RequestEvent) {
	const resolve = vi.fn(async () => new Response('page'));
	try {
		const response = await handle({ event, resolve });
		return { response, resolve, redirect: null };
	} catch (e) {
		if (isRedirect(e)) return { response: null, resolve, redirect: e };
		throw e;
	}
}

describe('cross-site changes (hooks.server handle)', () => {
	it('rejects a change sent from another site, even without a body', async () => {
		const { response, resolve } = await run(
			fakeEvent(
				'/api/items/x/purge',
				{},
				{ method: 'POST', headers: { origin: 'https://evil.example' } }
			)
		);
		expect(response?.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets changes from the app itself and reads from anywhere through', async () => {
		const own = await run(
			fakeEvent('/login', {}, { method: 'POST', headers: { origin: 'http://localhost' } })
		);
		expect(own.response?.status).toBe(200);
		const read = await run(
			fakeEvent('/login', {}, { headers: { origin: 'https://evil.example' } })
		);
		expect(read.response?.status).toBe(200);
	});
});

describe('auth guard (hooks.server handle)', () => {
	it('redirects a page request without a session to /login with the way back', async () => {
		const { redirect, resolve } = await run(fakeEvent('/items/42?tab=params'));
		expect(redirect?.status).toBe(303);
		expect(redirect?.location).toBe(`/login?next=${encodeURIComponent('/items/42?tab=params')}`);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('sends the QR link of a sticker through the login page', async () => {
		const { redirect } = await run(fakeEvent('/K7M4QX'));
		expect(redirect?.location).toBe('/login?next=%2FK7M4QX');
	});

	it.each(['/api/search?q=x', '/api/items', '/files/photos/a.webp'])(
		'answers 401 to %s without a session',
		async (path) => {
			const { response, resolve } = await run(fakeEvent(path));
			expect(response?.status).toBe(401);
			expect(await response?.json()).toMatchObject({ error: { code: 'unauthorized' } });
			expect(resolve).not.toHaveBeenCalled();
		}
	);

	it.each(['/login', '/healthz'])('lets %s through without a session', async (path) => {
		const { response, resolve } = await run(fakeEvent(path));
		expect(response?.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('treats an unknown session token as signed out and drops the cookie', async () => {
		const event = fakeEvent('/api/search', { [SESSION_COOKIE]: 'stale-token' });
		const { response } = await run(event);
		expect(response?.status).toBe(401);
		expect(event.cookies.get(SESSION_COOKIE)).toBeUndefined();
	});

	describe('with a session', () => {
		let userId: string;
		let token: string;

		beforeEach(async () => {
			userId = (await createTestActor('admin')).userId;
			token = (await createSession(userId)).token;
		});

		it.each(['/', '/api/search?q=x', '/files/photos/a.webp'])(
			'passes %s on with the user in locals',
			async (path) => {
				const event = fakeEvent(path, { [SESSION_COOKIE]: token });
				const { response, resolve } = await run(event);
				expect(response?.status).toBe(200);
				expect(resolve).toHaveBeenCalledOnce();
				expect(event.locals.user).toMatchObject({ id: userId, login: 'admin' });
				expect(event.locals.actor).toEqual({ userId, householdIds: [] });
			}
		);
	});
});
