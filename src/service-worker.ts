/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

/**
 * Service worker of the PWA. Data lives on the server, so the worker only makes
 * the app shell load fast and lets the last seen pages open without a network:
 * - app files (Vite build output and static/) are precached per version, except
 *   WebAssembly: the barcode reader is large and needed only by phones without a
 *   built-in barcode detector, so the browser's HTTP cache keeps it after first use;
 * - page navigations go to the network first and fall back to the last copy;
 *   with no copy, a «Нет связи» page explains what happened (`offlinePage`);
 * - /api/ and /files/ are never touched (always network, never cached).
 * A navigation also falls back when the server takes longer than NAVIGATION_TIMEOUT_MS
 * or the proxy in front of it answers 502/503/504 (app restarting or down).
 */
import { build, files, version } from '$service-worker';
import {
	isGatewayStatus,
	markOfflineCopy,
	offlinePage,
	type OfflineReason
} from '$lib/domain/offline';

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope;

const ASSETS_CACHE = `assets-${version}`;
/**
 * Last successful copy of each visited page, used only when offline. Per version:
 * a copy needs the scripts and styles of its version, and those are dropped with it.
 */
const PAGES_CACHE = `pages-${version}`;
const ASSETS = new Set([...build, ...files].filter((path) => !path.endsWith('.wasm')));

/**
 * A page that hasn't started to arrive by then is replaced by its saved copy or the
 * «Нет связи» page (the request still finishes in the background and refreshes the copy).
 */
const NAVIGATION_TIMEOUT_MS = 15_000;

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

/** The saved copy of a page, marked for ConnectionNotice, or the «Нет связи» page. */
async function fallbackPage(request: Request, reason: OfflineReason): Promise<Response> {
	const cached = await caches.match(request, { cacheName: PAGES_CACHE });
	if (cached) {
		const html = markOfflineCopy(await cached.text(), new Date(cached.headers.get('date') ?? ''));
		return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
	}
	return new Response(offlinePage(reason), {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}

/** Keeps the last good copy of a page; the login page clears them (signed out). */
async function savePage(request: Request, response: Response): Promise<void> {
	if (new URL(request.url).pathname === '/login') {
		// The login page opens only without a session (signed out or expired; a redirect
		// to it is opaque here): forget the pages of the previous session.
		if (response.status === 200) await caches.delete(PAGES_CACHE);
	} else if (response.status === 200 && response.type === 'basic') {
		const cache = await caches.open(PAGES_CACHE);
		await cache.put(request, response);
	}
}

async function networkFirstPage(event: FetchEvent): Promise<Response> {
	const { request } = event;
	const network = fetch(request).then((response) => {
		event.waitUntil(savePage(request, response.clone()));
		return response;
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), NAVIGATION_TIMEOUT_MS);
	});
	// The page may still arrive after the timeout: let it refresh the saved copy.
	event.waitUntil(network.catch(() => undefined));
	try {
		const response = await Promise.race([network, timeout]);
		if (response === 'timeout') return fallbackPage(request, 'timeout');
		// Only the proxy answers these (the app never does), and its error page says nothing useful.
		if (isGatewayStatus(response.status)) {
			return fallbackPage(request, 'down');
		}
		return response;
	} catch {
		return fallbackPage(request, 'network');
	} finally {
		clearTimeout(timer);
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
		event.respondWith(networkFirstPage(event));
	}
});
