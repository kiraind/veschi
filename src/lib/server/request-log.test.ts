import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLogLine, withRequestLog } from './request-log';

describe('requestLogLine', () => {
	it('names the method, path, status and time', () => {
		expect(requestLogLine('GET', '/items/abc?tab=1', 200, 12.4)).toBe(
			'GET /items/abc?tab=1 200 12ms'
		);
	});
});

function run(path: string, resolve: () => Response | Promise<Response>, isSubRequest = false) {
	const event = {
		request: new Request(`http://app${path}`),
		url: new URL(`http://app${path}`),
		isSubRequest
	} as unknown as RequestEvent;
	const handle = withRequestLog(async () => resolve());
	return handle({ event, resolve: async () => new Response() });
}

describe('withRequestLog', () => {
	const info = vi.spyOn(console, 'info').mockImplementation(() => {});
	const err = vi.spyOn(console, 'error').mockImplementation(() => {});
	afterEach(() => vi.clearAllMocks());

	it('logs a page with its status', async () => {
		await run('/items', () => new Response('ok'));
		expect(info).toHaveBeenCalledWith(expect.stringMatching(/^GET \/items 200 \d+ms$/));
	});

	it('logs server errors as errors', async () => {
		await run('/api/x', () => new Response('', { status: 500 }));
		expect(err).toHaveBeenCalledWith(expect.stringMatching(/^GET \/api\/x 500 /));
	});

	it('logs redirects and error() thrown by the hooks, and rethrows them', async () => {
		await expect(run('/items', () => redirect(303, '/login'))).rejects.toMatchObject({
			status: 303
		});
		await expect(run('/x', () => error(404))).rejects.toMatchObject({ status: 404 });
		await expect(
			run('/y', () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(info).toHaveBeenCalledWith(expect.stringMatching(/^GET \/items 303 /));
		expect(info).toHaveBeenCalledWith(expect.stringMatching(/^GET \/x 404 /));
		expect(err).toHaveBeenCalledWith(expect.stringMatching(/^GET \/y 500 /));
	});

	it('skips healthy health checks and server-side fetches of the app', async () => {
		await run('/healthz', () => new Response('ok'));
		await run('/api/items', () => new Response('[]'), true);
		expect(info).not.toHaveBeenCalled();
		await run('/healthz', () => new Response('', { status: 503 }));
		expect(err).toHaveBeenCalledWith(expect.stringMatching(/^GET \/healthz 503 /));
	});
});
