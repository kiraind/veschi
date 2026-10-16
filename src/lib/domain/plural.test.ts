import { describe, expect, it } from 'vitest';
import { pieces, piecesAccusative, piecesGenitive, plural } from './plural';

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

describe('pieces', () => {
	it('writes the quantity out', () => {
		expect([1, 3, 10, 21].map(pieces)).toEqual(['1 штука', '3 штуки', '10 штук', '21 штука']);
	});
});

describe('piecesAccusative', () => {
	it('writes the quantity out after a verb', () => {
		expect([1, 3, 10, 21].map(piecesAccusative)).toEqual([
			'1 штуку',
			'3 штуки',
			'10 штук',
			'21 штуку'
		]);
	});
});

describe('piecesGenitive', () => {
	it('writes the quantity out after «из»', () => {
		expect([1, 3, 10, 21].map(piecesGenitive)).toEqual([
			'1 штуки',
			'3 штук',
			'10 штук',
			'21 штуки'
		]);
	});
});
