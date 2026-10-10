import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const forms = ['штука', 'штуки', 'штук'] as const;

describe('plural', () => {
	it.each([
		[0, 'штук'],
		[1, 'штука'],
		[2, 'штуки'],
		[4, 'штуки'],
		[5, 'штук'],
		[11, 'штук'],
		[12, 'штук'],
		[14, 'штук'],
		[21, 'штука'],
		[22, 'штуки'],
		[25, 'штук'],
		[101, 'штука'],
		[111, 'штук'],
		[1004, 'штуки']
	])('%i → %s', (n, form) => {
		expect(plural(n, forms)).toBe(form);
	});
});
