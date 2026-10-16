import sharp from 'sharp';

/** Margin around the object, as a share of the side of the final square (Noah: 6%). */
export const FRAME_MARGIN = 0.06;
/** Pixels with at most this alpha are treated as empty when looking for the object. */
const EMPTY_ALPHA = 8;

export interface RawRgba {
	data: Buffer;
	width: number;
	height: number;
}

export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The bounding box of the visible pixels, or null when the picture is empty. */
export function objectBox({ data, width, height }: RawRgba): Box | null {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		const row = y * width * 4;
		for (let x = 0; x < width; x++) {
			if (data[row + x * 4 + 3]! <= EMPTY_ALPHA) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) return null;
	return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Where the object goes in the square: the square's side so that the longer
 * side of the box leaves FRAME_MARGIN of the side on both ends, and the box
 * centred in it (the shorter side gets wider margins).
 */
export function squareFor(box: Box): { side: number; left: number; top: number } {
	const side = Math.ceil(Math.max(box.width, box.height) / (1 - 2 * FRAME_MARGIN));
	return {
		side,
		left: Math.floor((side - box.width) / 2),
		top: Math.floor((side - box.height) / 2)
	};
}

/**
 * Crops a cutout to its object and centres it in a transparent square with the
 * margin; returns the square as a PNG of its natural size (never enlarged).
 */
export async function frameObject(image: RawRgba): Promise<Buffer | null> {
	const box = objectBox(image);
	if (!box) return null;
	const { side, left, top } = squareFor(box);
	const raw = { width: image.width, height: image.height, channels: 4 as const };
	const object = await sharp(image.data, { raw }).extract(box).png().toBuffer();
	return sharp({
		create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: object, left, top }])
		.png()
		.toBuffer();
}
