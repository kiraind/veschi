import { describe, expect, it } from 'vitest';
import { LoginThrottle } from './throttle';

describe('LoginThrottle', () => {
	it('locks a key after five failures within a minute, then lets it try again', () => {
		let now = 0;
		const throttle = new LoginThrottle(() => now);
		for (let i = 0; i < 5; i++) {
			expect(throttle.retryAfter(['admin'])).toBe(0);
			throttle.fail(['admin']);
			now += 1000;
		}
		expect(throttle.retryAfter(['admin', '10.0.0.1'])).toBe(55);
		expect(throttle.retryAfter(['other'])).toBe(0);
		now = 60_001;
		expect(throttle.retryAfter(['admin'])).toBe(0);
	});

	it('forgets failures after a successful sign-in', () => {
		const throttle = new LoginThrottle(() => 0);
		for (let i = 0; i < 5; i++) throttle.fail(['admin']);
		throttle.succeed(['admin']);
		expect(throttle.retryAfter(['admin'])).toBe(0);
	});

	it('counts an attempt before the password is checked, so parallel ones are limited too', () => {
		const throttle = new LoginThrottle(() => 0);
		const results = Array.from({ length: 8 }, () => throttle.attempt(['admin']));
		expect(results.filter((wait) => wait === 0)).toHaveLength(5);
		throttle.succeed(['admin']);
		expect(throttle.attempt(['admin'])).toBe(0);
	});
});
