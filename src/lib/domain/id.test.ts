import { describe, expect, it } from 'vitest';
import { idSchema } from './id';

describe('ids', () => {
	it('accepts cuids and rejects UUIDs and junk', () => {
		expect(idSchema.safeParse('cmv2qfe3drsjj9syzvrcod7pl').success).toBe(true);
		expect(idSchema.safeParse('33333333-3333-4333-8333-333333333332').success).toBe(false);
		expect(idSchema.safeParse('').success).toBe(false);
		expect(idSchema.safeParse('c a').success).toBe(false);
	});
});
