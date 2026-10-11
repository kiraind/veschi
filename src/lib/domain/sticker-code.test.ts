import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	CODE_ALPHABET,
	codeQuery,
	MIN_CODE_DISTANCE,
	RESERVED_CODES,
	TOP_LEVEL_ROUTES,
	codeNeighbors,
	findSimilar,
	formatCode,
	generateCodes,
	hammingDistance,
	isCode,
	normalizeCode,
	type RandomInt
} from './sticker-code';

/** Deterministic RandomInt (mulberry32). */
function seeded(seed: number): RandomInt {
	let a = seed;
	return (max) => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
	};
}

describe('sticker codes', () => {
	it('alphabet has 31 characters without look-alikes', () => {
		expect(CODE_ALPHABET).toHaveLength(31);
		for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c);
	});

	it('normalizes any case and dash placement to one code', () => {
		for (const input of ['k7m4qx', 'K7M-4QX', 'k7m-4qx', ' K7M4QX ']) {
			expect(normalizeCode(input)).toBe('K7M4QX');
		}
	});

	it('rejects invalid codes', () => {
		expect(normalizeCode('K7M4Q')).toBeNull();
		expect(normalizeCode('K7M4Q0')).toBeNull();
		expect(normalizeCode('K7M4QXX')).toBeNull();
		expect(normalizeCode('')).toBeNull();
	});

	it('formats with a dash', () => {
		expect(formatCode('K7M4QX')).toBe('K7M-4QX');
		expect(isCode('k7m4qx')).toBe(true);
		expect(isCode('login')).toBe(false);
	});

	it('counts differing positions', () => {
		expect(hammingDistance('K7M4QX', 'K7M4QX')).toBe(0);
		expect(hammingDistance('K7M4QX', 'K7M4QY')).toBe(1);
		expect(hammingDistance('K7M4QX', '27M4QY')).toBe(2);
	});

	it('lists all one-typo neighbours', () => {
		const neighbors = codeNeighbors('K7M4QX');
		expect(neighbors).toHaveLength(6 * 30);
		expect(new Set(neighbors).size).toBe(180);
		for (const n of neighbors) expect(hammingDistance(n, 'K7M4QX')).toBe(1);
	});

	it('suggests a code one typo away', () => {
		expect(findSimilar('K7M4QY', ['ABCDEF', 'K7M4QX'])).toBe('K7M4QX');
		expect(findSimilar('K7M4ZZ', ['ABCDEF', 'K7M4QX'])).toBeNull();
	});

	it('never generates reserved codes', () => {
		for (const r of RESERVED_CODES) expect(isCode(r)).toBe(true);
	});
});

describe('generateCodes', () => {
	function expectAllFar(codes: string[]) {
		codes.forEach((a, i) => {
			for (const b of codes.slice(i + 1)) {
				expect(hammingDistance(a, b)).toBeGreaterThanOrEqual(MIN_CODE_DISTANCE);
			}
		});
	}

	it('produces valid codes far from each other and from existing ones', () => {
		const existing = generateCodes([], 200, seeded(1));
		const fresh = generateCodes(existing, 300, seeded(2));
		expect(fresh).toHaveLength(300);
		for (const c of fresh) expect(isCode(c)).toBe(true);
		expectAllFar([...existing, ...fresh]);
	});

	it('rejects candidates within distance 2 of an existing code', () => {
		// The RNG first proposes K7M4QY (distance 1 to K7M4QX) and 27M4QY (distance 2), then 2222222.
		const sequence = [...'K7M4QY', ...'27M4QY', ...'222222'].map((c) => CODE_ALPHABET.indexOf(c));
		let i = 0;
		const random: RandomInt = () => sequence[i++]!;
		expect(generateCodes(['K7M4QX'], 1, random)).toEqual(['222222']);
	});

	it('is deterministic with an injected RNG', () => {
		expect(generateCodes([], 10, seeded(7))).toEqual(generateCodes([], 10, seeded(7)));
	});

	it('handles tens of thousands of existing codes quickly', () => {
		const existing = generateCodes([], 30_000, seeded(3));
		const started = performance.now();
		const fresh = generateCodes(existing, 1080, seeded(4));
		expect(performance.now() - started).toBeLessThan(2000);
		expect(fresh).toHaveLength(1080);
		for (const c of fresh.slice(0, 50)) {
			expect(existing.every((e) => hammingDistance(c, e) >= MIN_CODE_DISTANCE)).toBe(true);
		}
	});

	it('uses crypto randomness by default', () => {
		const codes = generateCodes([], 5);
		expect(codes).toHaveLength(5);
		expectAllFar(codes);
	});
});

describe('codeQuery', () => {
	it('takes a piece of an ID in any case, with or without the dash', () => {
		expect(codeQuery('k7m')).toBe('K7M');
		expect(codeQuery(' K7M-4QX ')).toBe('K7M4QX');
		expect(codeQuery('m-4q')).toBe('M4Q');
	});

	it('ignores text an ID cannot contain and pieces too short or too long', () => {
		expect(codeQuery('k7')).toBeNull();
		expect(codeQuery('коробка')).toBeNull();
		expect(codeQuery('box')).toBeNull();
		expect(codeQuery('K7M4QXA')).toBeNull();
	});
});

describe('TOP_LEVEL_ROUTES', () => {
	it('lists every top-level route folder, so no issued code is shadowed by a page', () => {
		const folders = readdirSync('src/routes', { withFileTypes: true })
			.filter((e) => e.isDirectory() && /^[a-z]/.test(e.name))
			.map((e) => e.name)
			.sort();
		expect([...TOP_LEVEL_ROUTES].sort()).toEqual(folders);
		expect([...RESERVED_CODES]).toEqual(['PARAMS']);
	});
});
