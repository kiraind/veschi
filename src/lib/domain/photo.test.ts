import { describe, expect, it } from 'vitest';
import { centerSquare } from './photo';

describe('centerSquare', () => {
	it('cuts the middle of a landscape frame', () => {
		expect(centerSquare(1920, 1080, 2048)).toEqual({ sx: 420, sy: 0, side: 1080, size: 1080 });
	});

	it('cuts the middle of a portrait frame', () => {
		expect(centerSquare(1080, 1920, 2048)).toEqual({ sx: 0, sy: 420, side: 1080, size: 1080 });
	});

	it('scales a large square down to maxSide', () => {
		expect(centerSquare(4000, 3000, 2048)).toEqual({ sx: 500, sy: 0, side: 3000, size: 2048 });
	});

	it('keeps a square frame whole', () => {
		expect(centerSquare(720, 720, 2048)).toEqual({ sx: 0, sy: 0, side: 720, size: 720 });
	});
});
