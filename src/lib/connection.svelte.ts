/**
 * Whether the server can be reached, for the notice at the bottom of the screen
 * (ConnectionNotice). Requests through `$lib/api` report here; while the server
 * is unreachable, /healthz is polled until it answers again.
 */
import { browser } from '$app/environment';

/** How often /healthz is asked while the server is unreachable. */
export const RECHECK_MS = 5000;

class Connection {
	/** The device has a network (`navigator.onLine`). */
	online = $state(true);
	/** The last request did not reach the server (no answer, or the proxy said it is down). */
	unreachable = $state(false);
	/** Requests through `$lib/api` that have not finished yet. */
	pending = $state(0);
	/** The server answered again after being unreachable; cleared by the notice. */
	restored = $state(false);

	#timer: ReturnType<typeof setTimeout> | undefined;

	reached() {
		if (this.unreachable) this.restored = true;
		this.unreachable = false;
		clearTimeout(this.#timer);
	}

	failed() {
		this.unreachable = true;
		this.restored = false;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.recheck(), RECHECK_MS);
	}

	/** Asks /healthz now; keeps asking every RECHECK_MS while it does not answer. */
	async recheck() {
		clearTimeout(this.#timer);
		try {
			const response = await fetch('/healthz', { cache: 'no-store' });
			if (response.ok) return this.reached();
		} catch {
			// still no connection
		}
		this.failed();
	}
}

export const connection = new Connection();

if (browser) {
	connection.online = navigator.onLine;
	window.addEventListener('offline', () => (connection.online = false));
	window.addEventListener('online', () => {
		connection.online = true;
		if (connection.unreachable) void connection.recheck();
	});
}
