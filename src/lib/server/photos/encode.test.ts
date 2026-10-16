import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EmptyCutoutError, cutoutVariants, processorInput } from './encode';

/** A transparent PNG with an opaque red disc-ish square in it. */
function cutout(width: number, height: number, object: number): Promise<Buffer> {
	const square = sharp({
		create: {
			width: object,
			height: object,
			channels: 4,
			background: { r: 200, g: 40, b: 40, alpha: 1 }
		}
	})
		.png()
		.toBuffer();
	return square.then((input) =>
		sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
			.composite([{ input, left: 10, top: 20 }])
			.png()
			.toBuffer()
	);
}

describe('photo encoding', () => {
	it('turns a cutout into square WebPs cropped to the object', async () => {
		const { full, thumb } = await cutoutVariants(await cutout(800, 600, 440));
		const fullMeta = await sharp(full).metadata();
		const thumbMeta = await sharp(thumb).metadata();
		expect([fullMeta.format, fullMeta.width, fullMeta.height, fullMeta.hasAlpha]).toEqual([
			'webp',
			500,
			500,
			true
		]);
		expect([thumbMeta.width, thumbMeta.height]).toEqual([320, 320]);
	});

	it('refuses an empty cutout', async () => {
		const empty = await sharp({
			create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
		})
			.png()
			.toBuffer();
		await expect(cutoutVariants(empty)).rejects.toBeInstanceOf(EmptyCutoutError);
	});

	it('sends the processor an opaque JPEG without the padding of an old photo', async () => {
		const padded = await sharp(await cutout(600, 600, 300))
			.webp()
			.toBuffer();
		const input = await processorInput(padded);
		const meta = await sharp(input).metadata();
		expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
			'jpeg',
			300,
			300,
			false
		]);
	});

	it('shrinks a large upload for the processor', async () => {
		const big = await sharp({
			create: { width: 4000, height: 3000, channels: 3, background: { r: 1, g: 2, b: 3 } }
		})
			.jpeg()
			.toBuffer();
		const meta = await sharp(await processorInput(big)).metadata();
		expect([meta.width, meta.height]).toEqual([2048, 1536]);
	});
});
