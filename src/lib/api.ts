/**
 * Browser-side client for the JSON API under /api. All changes go through this
 * one layer (groundwork for the future offline mode, see docs/spec.md).
 */
import { untrack } from 'svelte';
import { browser } from '$app/environment';
import { connection } from '$lib/connection.svelte';
import { isGatewayStatus } from '$lib/domain/offline';

/** A read gives up after this long; changes are not cut off (a photo upload can be slow). */
const GET_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

type Fetch = typeof fetch;

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	fetchImpl: Fetch = fetch
): Promise<T> {
	const init: RequestInit = { method, headers: {} };
	if (method === 'GET') init.signal = AbortSignal.timeout(GET_TIMEOUT_MS);
	if (body instanceof FormData) {
		init.body = body;
	} else if (body !== undefined) {
		init.body = JSON.stringify(body);
		(init.headers as Record<string, string>)['content-type'] = 'application/json';
	}
	const response = await track(fetchImpl(path, init));
	if (response.status === 401 && typeof window !== 'undefined') {
		window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
	}
	if (!response.ok) {
		let payload: { error?: { code?: string; message?: string; details?: unknown } } = {};
		try {
			payload = await response.json();
		} catch {
			// not JSON
		}
		throw new ApiError(
			response.status,
			payload.error?.code ?? 'http_error',
			payload.error?.message ??
				(isGatewayStatus(response.status)
					? `Сервер недоступен (${response.status}), попробуйте позже`
					: `Ошибка ${response.status}`),
			payload.error?.details
		);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

/** Reports to `connection` whether the request reached the server (in the browser only). */
async function track(pending: Promise<Response>): Promise<Response> {
	if (!browser) return pending;
	// Untracked: `++` reads the counter, and an $effect that loads data through the
	// API would then depend on it and rerun on every request it makes itself.
	untrack(() => connection.pending++);
	try {
		const response = await pending;
		// The app never answers 502/503/504 itself: it is the proxy saying the app is down.
		if (isGatewayStatus(response.status)) connection.failed();
		else connection.reached();
		return response;
	} catch (e) {
		if (!(e instanceof DOMException && e.name === 'AbortError')) connection.failed();
		throw e;
	} finally {
		connection.pending--;
	}
}

export const api = {
	get: <T>(path: string, fetchImpl?: Fetch) => request<T>('GET', path, undefined, fetchImpl),
	post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
	put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
	patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
	delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body)
};

/**
 * Text of a failed request for the user: the server's message, or `fallback`
 * when the request did not reach the server (no network, aborted).
 */
export function errorText(
	e: unknown,
	fallback = 'Нет связи с сервером, попробуйте ещё раз'
): string {
	if (e instanceof ApiError) return e.message;
	if (e instanceof DOMException && e.name === 'TimeoutError') {
		return 'Сервер не ответил вовремя, попробуйте ещё раз';
	}
	return fallback;
}
