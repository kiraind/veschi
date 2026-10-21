/** Failed sign-ins allowed per key (login or address) within WINDOW_MS before it is locked. */
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

/**
 * Counts failed sign-ins per key in memory (one app process). After
 * MAX_FAILURES within a minute the key is refused until the minute passes, so
 * a password cannot be guessed at argon2 speed, and argon2's memory is not
 * spent on every attempt.
 */
export class LoginThrottle {
	private failures = new Map<string, number[]>();

	constructor(private now: () => number = Date.now) {}

	/** Seconds until any of the keys may try again; 0 = may try now. */
	retryAfter(keys: string[]): number {
		const now = this.now();
		let wait = 0;
		for (const key of keys) {
			const recent = this.recent(key, now);
			if (recent.length >= MAX_FAILURES) {
				wait = Math.max(wait, Math.ceil((recent[0]! + WINDOW_MS - now) / 1000));
			}
		}
		return wait;
	}

	/**
	 * Starts an attempt: refuses it (returns seconds to wait) or counts it as a
	 * failure up front, so parallel requests cannot all pass the check before any
	 * failure is recorded. `succeed` forgets it once the password turns out right.
	 */
	attempt(keys: string[]): number {
		const wait = this.retryAfter(keys);
		if (wait === 0) this.fail(keys);
		return wait;
	}

	fail(keys: string[]): void {
		const now = this.now();
		for (const key of keys) this.failures.set(key, [...this.recent(key, now), now]);
	}

	succeed(keys: string[]): void {
		for (const key of keys) this.failures.delete(key);
	}

	private recent(key: string, now: number): number[] {
		const recent = (this.failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
		if (recent.length) this.failures.set(key, recent);
		else this.failures.delete(key);
		return recent;
	}
}

export const loginThrottle = new LoginThrottle();
