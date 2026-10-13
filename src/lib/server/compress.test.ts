import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compress } from './compress';

const big = '<p>Вещи</p>'.repeat(500);

function request(acceptEncoding = 'gzip, deflate, br', method = 'GET'): Request {
	return new Request('http://localhost/', {
		method,
		headers: { 'accept-encoding': acceptEncoding }
	});
}

function page(body: string | null = big, headers: Record<string, string> = {}): Response {
	return new Response(body, { headers: { 'content-type': 'text/html', ...headers } });
}

describe('compress', () => {
	it('gzips a page and keeps its other headers', async () => {
		const original = page(big, { 'cache-control': 'private' });
		original.headers.append('set-cookie', 'a=1');
		original.headers.append('set-cookie', 'b=2');
		const res = compress(request(), original);
		expect(res.headers.get('content-encoding')).toBe('gzip');
		expect(res.headers.get('vary')).toBe('accept-encoding');
		expect(res.headers.get('cache-control')).toBe('private');
		expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
		const body = Buffer.from(await res.arrayBuffer());
		expect(body.length).toBeLessThan(big.length / 10);
		expect(gunzipSync(body).toString()).toBe(big);
	});

	it('gzips JSON of unknown length', () => {
		const res = compress(
			request(),
			new Response(new Blob([big]).stream(), { headers: { 'content-type': 'application/json' } })
		);
		expect(res.headers.get('content-encoding')).toBe('gzip');
	});

	it('leaves alone what should not be compressed', () => {
		const cases: [Request, Response][] = [
			[request('identity'), page()],
			[request('gzip', 'HEAD'), page()],
			[request(), page(null, {}) /* redirect or 204 */],
			[request(), page('<p>мало</p>', { 'content-length': '20' })],
			[request(), page(big, { 'content-type': 'image/webp' })],
			[request(), page(big, { 'content-encoding': 'br' })]
		];
		for (const [req, res] of cases) expect(compress(req, res)).toBe(res);
	});
});
