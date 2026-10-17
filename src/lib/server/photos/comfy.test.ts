import { describe, expect, it } from 'vitest';
import { ComfyClient, ProcessorError, ProcessorUnavailableError } from './comfy';
import { CUTOUT } from './workflows';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** A fetch that answers by "METHOD /path" and records the requests. */
function fakeFetch(routes: Record<string, Handler>) {
	const calls: { method: string; url: URL; init: RequestInit }[] = [];
	const fetch = (async (input: string | URL, init: RequestInit = {}) => {
		const url = new URL(input);
		const method = init.method ?? 'GET';
		calls.push({ method, url, init });
		const handler = routes[`${method} ${url.pathname}`] ?? routes[`${method} ${url.origin}`];
		if (!handler) return new Response('not found', { status: 404 });
		return handler(url, init);
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const output = {
	'3': { images: [{ filename: 'veschi-cutout_00001_.png', subfolder: '', type: 'output' }] }
};

describe('ComfyUI client', () => {
	it('runs a workflow on a self-hosted ComfyUI', async () => {
		let polls = 0;
		const { fetch, calls } = fakeFetch({
			'POST /api/upload/image': () => json({ name: 'veschi-1.jpg', subfolder: '', type: 'input' }),
			'POST /api/prompt': () => json({ prompt_id: 'p1', number: 1 }),
			'GET /api/history/p1': () =>
				++polls < 2
					? json({})
					: json({ p1: { outputs: output, status: { status_str: 'success', completed: true } } }),
			'GET /api/view': () => new Response(new Uint8Array([1, 2, 3]))
		});
		const client = new ComfyClient({ baseUrl: 'http://comfy:8188/', fetch, pollMs: 1 });
		const result = await client.run(CUTOUT, Buffer.from('jpeg'), 5000);
		expect([...result]).toEqual([1, 2, 3]);

		const prompt = JSON.parse(
			calls.find((c) => c.url.pathname === '/api/prompt')!.init.body as string
		);
		expect(prompt.prompt['1'].inputs.image).toBe('veschi-1.jpg');
		expect(prompt.prompt['2'].class_type).toBe('BiRefNetRMBG');
		const view = calls.find((c) => c.url.pathname === '/api/view')!.url;
		expect(view.searchParams.get('filename')).toBe('veschi-cutout_00001_.png');
		expect(calls.every((c) => !new Headers(c.init.headers).has('x-api-key'))).toBe(true);
	});

	it('runs a workflow on Comfy Cloud with the key and a signed output URL', async () => {
		const { fetch, calls } = fakeFetch({
			'POST /api/upload/image': () => json({ name: 'abc.jpg', subfolder: '' }),
			'POST /api/prompt': () => json({ prompt_id: 'j1' }),
			'GET /api/jobs/j1': () => json({ id: 'j1', status: 'completed', outputs: output }),
			'GET /api/view': () =>
				new Response(null, {
					status: 302,
					headers: { location: 'https://files.example/signed?x=1' }
				}),
			'GET https://files.example': () => new Response(new Uint8Array([9]))
		});
		const client = new ComfyClient({
			baseUrl: 'https://cloud.comfy.org',
			apiKey: 'k',
			fetch,
			pollMs: 1
		});
		expect([...(await client.run(CUTOUT, Buffer.from('jpeg'), 5000))]).toEqual([9]);
		const keyed = calls.filter((c) => new Headers(c.init.headers).get('x-api-key') === 'k');
		expect(keyed.map((c) => c.url.pathname)).toEqual([
			'/api/upload/image',
			'/api/prompt',
			'/api/jobs/j1',
			'/api/view'
		]);
		// The signed URL gets no key.
		expect(new Headers(calls.at(-1)!.init.headers).has('x-api-key')).toBe(false);
	});

	it('reports a failed run with the node and its message', async () => {
		const { fetch } = fakeFetch({
			'POST /api/upload/image': () => json({ name: 'a.jpg' }),
			'POST /api/prompt': () => json({ prompt_id: 'p2' }),
			'GET /api/history/p2': () =>
				json({
					p2: {
						outputs: {},
						status: {
							status_str: 'error',
							completed: false,
							messages: [
								[
									'execution_error',
									{ node_type: 'BiRefNetRMBG', exception_message: 'CUDA out of memory' }
								]
							]
						}
					}
				})
		});
		const client = new ComfyClient({ baseUrl: 'http://comfy:8188', fetch, pollMs: 1 });
		await expect(client.run(CUTOUT, Buffer.from('x'), 5000)).rejects.toThrow(
			new ProcessorError('BiRefNetRMBG: CUDA out of memory')
		);
	});

	it('tells an unreachable or overloaded processor from a broken workflow', async () => {
		const down = new ComfyClient({
			baseUrl: 'http://comfy:8188',
			fetch: (async () => {
				throw new TypeError('fetch failed');
			}) as typeof fetch
		});
		await expect(down.run(CUTOUT, Buffer.from('x'), 5000)).rejects.toBeInstanceOf(
			ProcessorUnavailableError
		);

		const { fetch } = fakeFetch({
			'POST /api/upload/image': () => json({ name: 'a.jpg' }),
			'POST /api/prompt': () => json({ error: { message: 'Node BiRefNetRMBG not found' } }, 400)
		});
		const broken = new ComfyClient({ baseUrl: 'http://comfy:8188', fetch });
		await expect(broken.run(CUTOUT, Buffer.from('x'), 5000)).rejects.toBeInstanceOf(ProcessorError);

		const busy = new ComfyClient({
			baseUrl: 'https://cloud.comfy.org',
			apiKey: 'k',
			fetch: fakeFetch({ 'POST /api/upload/image': () => json({}, 429) }).fetch
		});
		await expect(busy.run(CUTOUT, Buffer.from('x'), 5000)).rejects.toBeInstanceOf(
			ProcessorUnavailableError
		);
	});

	it('gives up after the timeout and drops the prompt', async () => {
		const { fetch, calls } = fakeFetch({
			'POST /api/upload/image': () => json({ name: 'a.jpg' }),
			'POST /api/prompt': () => json({ prompt_id: 'p3' }),
			'GET /api/history/p3': () => json({}),
			'POST /api/queue': () => json({}),
			'POST /api/interrupt': () => json({})
		});
		const client = new ComfyClient({ baseUrl: 'http://comfy:8188', fetch, pollMs: 5 });
		await expect(client.run(CUTOUT, Buffer.from('x'), 50)).rejects.toThrow(/did not finish/);
		const queue = calls.find((c) => c.url.pathname === '/api/queue')!;
		expect(JSON.parse(queue.init.body as string)).toEqual({ delete: ['p3'] });
	});
});
