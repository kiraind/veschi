import sharp from 'sharp';
import { correctLight } from './light';
import { frameObject } from './frame';

/** Side of a stored photo (square), px: full size and thumbnail. */
export const PHOTO_MAX_SIDE = 2048;
export const PHOTO_THUMB_SIDE = 320;
/** Larger pictures are rejected before decoding: a small PNG can unpack to gigabytes. */
export const PHOTO_MAX_PIXELS = 50_000_000;
/** Longest side of the picture sent to the processor. */
const INPUT_MAX_SIDE = 2048;

/** A photo in the two stored sizes: full (for the photo itself) and a thumbnail (lists). */
export interface PhotoVariants {
	full: Buffer;
	thumb: Buffer;
}

/** The two square WebPs of a square picture, never enlarged. */
export async function squareVariants(square: Buffer): Promise<PhotoVariants> {
	const { width = 0 } = await sharp(square).metadata();
	const encode = (side: number, quality: number) =>
		sharp(square)
			.resize({ width: Math.min(width, side), height: Math.min(width, side), fit: 'fill' })
			.webp({ quality })
			.toBuffer();
	return { full: await encode(PHOTO_MAX_SIDE, 88), thumb: await encode(PHOTO_THUMB_SIDE, 75) };
}

/**
 * The picture sent to the processor: EXIF rotation applied, transparent margins
 * of an old padded photo trimmed and the rest flattened on white (the processor
 * loads RGB), at most INPUT_MAX_SIDE, as a high quality JPEG.
 */
export async function processorInput(data: Buffer): Promise<Buffer> {
	const input = sharp(data, { limitInputPixels: PHOTO_MAX_PIXELS }).rotate();
	const { hasAlpha } = await sharp(data, { limitInputPixels: PHOTO_MAX_PIXELS }).metadata();
	let picture = await input.png().toBuffer();
	if (hasAlpha) {
		// trim() fails on a picture of one colour; then there is nothing to trim.
		picture = await sharp(picture)
			.trim()
			.toBuffer()
			.catch(() => picture);
	}
	return sharp(picture)
		.flatten({ background: '#ffffff' })
		.resize({
			width: INPUT_MAX_SIDE,
			height: INPUT_MAX_SIDE,
			fit: 'inside',
			withoutEnlargement: true
		})
		.jpeg({ quality: 95 })
		.toBuffer();
}

/** Thrown when the cutout has no object left (the model found nothing). */
export class EmptyCutoutError extends Error {
	constructor() {
		super('На фото не нашлось предмета: вырезка получилась пустой');
	}
}

/**
 * The stored versions of a cutout from the processor (an image with alpha):
 * light corrected over the object, cropped to it with the margin, square.
 */
export async function cutoutVariants(cutout: Buffer): Promise<PhotoVariants> {
	const { data, info } = await sharp(cutout, { limitInputPixels: PHOTO_MAX_PIXELS })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	if (!correctLight(data)) throw new EmptyCutoutError();
	const square = await frameObject({ data, width: info.width, height: info.height });
	if (!square) throw new EmptyCutoutError();
	return squareVariants(square);
}
