import { isHttpError, isRedirect, type Handle } from '@sveltejs/kit';

/** One line of the request log: `GET /items/abc 200 12ms`. */
export function requestLogLine(method: string, path: string, status: number, ms: number): string {
	return `${method} ${path} ${status} ${Math.round(ms)}ms`;
}

/** Docker's HEALTHCHECK asks every 30 s: only a failed check is worth a line. */
function isQuiet(pathname: string, status: number): boolean {
	return pathname === '/healthz' && status < 400;
}

/** Status of an error thrown out of `resolve`: a redirect or `error()`, anything else is a 500. */
function thrownStatus(e: unknown): number {
	if (isRedirect(e) || isHttpError(e)) return e.status;
	return 500;
}

/**
 * Wraps the app's `handle` to log every request that reaches the app with its
 * status and time, so a request missing from the log never got here (the proxy
 * answered it). App files (/_app/…) are served before the hooks and are not
 * logged. Errors themselves are logged by SvelteKit's handleError and `errorResponse`.
 */
export function withRequestLog(handle: Handle): Handle {
	return async (input) => {
		const { event } = input;
		if (event.isSubRequest) return handle(input);
		const start = performance.now();
		const { method } = event.request;
		const { pathname, search } = event.url;
		const log = (status: number) => {
			if (isQuiet(pathname, status)) return;
			const line = requestLogLine(method, pathname + search, status, performance.now() - start);
			if (status >= 500) console.error(line);
			else console.info(line);
		};
		try {
			const response = await handle(input);
			log(response.status);
			return response;
		} catch (e) {
			log(thrownStatus(e));
			throw e;
		}
	};
}
