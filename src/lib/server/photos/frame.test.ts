import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FRAME_MARGIN, frameObject, objectBox, squareFor } from './frame';

/** A transparent picture with an opaque rectangle. */
function picture(
	width: number,
	height: number,
	rect: { left: number; top: number; width: number; height: number }
) {
	const data = Buffer.alloc(width * height * 4);
	for (let y = rect.top; y < rect.top + rect.height; y++) {
		for (let x = rect.left; x < rect.left + rect.width; x++)
			data.set([10, 20, 30, 255], (y * width + x) * 4);
	}
	return { data, width, height };
}

describe('framing a cutout', () => {
	it('finds the box of the visible pixels', () => {
		expect(objectBox(picture(50, 40, { left: 5, top: 7, width: 20, height: 10 }))).toEqual({
			left: 5,
			top: 7,
			width: 20,
			height: 10
		});
		expect(objectBox(picture(10, 10, { left: 0, top: 0, width: 0, height: 0 }))).toBeNull();
	});

	it('leaves the margin along the longer side and centres the shorter one', () => {
		const { side, left, top } = squareFor({ left: 0, top: 0, width: 880, height: 440 });
		expect(side).toBe(1000);
		expect(left).toBe(Math.round(1000 * FRAME_MARGIN));
		expect(top).toBe(280);
	});

	it('crops a tall object into a square with 6% margins', async () => {
		const square = await frameObject(
			picture(300, 400, { left: 100, top: 50, width: 44, height: 220 })
		);
		const { data, info } = await sharp(square!).raw().toBuffer({ resolveWithObject: true });
		expect(info.width).toBe(250);
		expect(info.height).toBe(250);
		const box = objectBox({ data, width: info.width, height: info.height })!;
		expect(box.top).toBe(15);
		expect(box.height).toBe(220);
		expect(box.left).toBe(103);
	});

	it('returns null for an empty cutout', async () => {
		expect(await frameObject(picture(20, 20, { left: 0, top: 0, width: 0, height: 0 }))).toBeNull();
	});
});
