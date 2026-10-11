/**
 * Browser-side client for the JSON API under /api. All changes go through this
 * one layer (groundwork for the future offline mode, see docs/spec.md).
 */
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
	if (body instanceof FormData) {
		init.body = body;
	} else if (body !== undefined) {
		init.body = JSON.stringify(body);
		(init.headers as Record<string, string>)['content-type'] = 'application/json';
	}
	const response = await fetchImpl(path, init);
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
			payload.error?.message ?? `Ошибка ${response.status}`,
			payload.error?.details
		);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
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
	return e instanceof ApiError ? e.message : fallback;
}
