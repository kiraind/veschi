/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

/**
 * Service worker of the PWA. Data lives on the server, so the worker only makes
 * the app shell load fast and lets the last seen pages open without a network:
 * - app files (Vite build output and static/) are precached per version;
 * - page navigations go to the network first and fall back to the last copy;
 * - /api/ and /files/ are never touched (always network, never cached).
 */
import { build, files, version } from '$service-worker';

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope;

const ASSETS_CACHE = `assets-${version}`;
/** Last successful copy of each visited page, used only when offline. */
const PAGES_CACHE = 'pages';
const ASSETS = new Set([...build, ...files]);

const OFFLINE_HTML = `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Нет сети — Вещи</title>
<body style="font-family: system-ui, sans-serif; padding: 2rem; text-align: center">
<h1>Нет сети</h1><p>Эта страница ещё не открывалась на этом устройстве. Проверьте подключение и обновите страницу.</p>
</body></html>`;

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(ASSETS_CACHE).then((cache) => cache.addAll([...ASSETS])));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== ASSETS_CACHE && key !== PAGES_CACHE)
						.map((key) => caches.delete(key))
				)
			)
	);
});

function isUncached(url: URL): boolean {
	return url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/');
}

async function fromAssets(request: Request): Promise<Response> {
	const cached = await caches.match(request, { cacheName: ASSETS_CACHE });
	return cached ?? fetch(request);
}

async function networkFirstPage(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (new URL(request.url).pathname === '/login') {
			// The login page opens only without a session (signed out or expired; a redirect
			// to it is opaque here): forget the pages of the previous session.
			if (response.status === 200) await caches.delete(PAGES_CACHE);
		} else if (response.status === 200 && response.type === 'basic') {
			const cache = await caches.open(PAGES_CACHE);
			await cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request, { cacheName: PAGES_CACHE });
		return (
			cached ??
			new Response(OFFLINE_HTML, {
				status: 503,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			})
		);
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin || isUncached(url)) return;

	if (request.method === 'POST' && url.pathname === '/logout') {
		event.waitUntil(caches.delete(PAGES_CACHE));
		return;
	}
	if (request.method !== 'GET') return;

	if (ASSETS.has(url.pathname)) {
		event.respondWith(fromAssets(request));
	} else if (request.mode === 'navigate') {
		event.respondWith(networkFirstPage(request));
	}
});
