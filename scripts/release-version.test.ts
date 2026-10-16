import { describe, expect, it } from 'vitest';
import { nextVersion } from './release-version.mjs';

describe('nextVersion', () => {
	it('starts at 1.0.0 whatever the bump', () => {
		expect(nextVersion(undefined, 'patch')).toBe('1.0.0');
		expect(nextVersion(undefined, 'major')).toBe('1.0.0');
	});

	it('bumps one part and resets the lower ones', () => {
		expect(nextVersion('v1.2.3', 'patch')).toBe('1.2.4');
		expect(nextVersion('v1.2.3', 'minor')).toBe('1.3.0');
		expect(nextVersion('v1.2.3', 'major')).toBe('2.0.0');
		expect(nextVersion('v1.9.9', 'patch')).toBe('1.9.10');
	});

	it('rejects unknown bumps and malformed tags', () => {
		expect(() => nextVersion('v1.2.3', 'auto')).toThrow(/Unknown bump/);
		expect(() => nextVersion('1.2.3', 'patch')).toThrow(/not vMAJOR/);
		expect(() => nextVersion('v1.2', 'patch')).toThrow(/not vMAJOR/);
	});
});
