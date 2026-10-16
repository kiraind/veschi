import { describe, expect, it } from 'vitest';
import { correctLight, measureLight } from './light';

/** An RGBA buffer of `count` pixels of one colour, plus `transparent` empty ones. */
function pixels(colour: [number, number, number], count: number, transparent = 0): Buffer {
	const data = Buffer.alloc((count + transparent) * 4);
	for (let i = 0; i < count; i++) data.set([...colour, 255], i * 4);
	return data;
}

/** A gradient of one hue from dark to bright, as an object would have. */
function gradient(tint: [number, number, number]): Buffer {
	const data = Buffer.alloc(256 * 4);
	for (let v = 0; v < 256; v++) {
		data.set([...tint.map((t) => Math.round(v * t)), 255], v * 4);
	}
	return data;
}

const channel = (data: Buffer, i: number, c: number) => data[i * 4 + c]!;

describe('light correction', () => {
	it('finds nothing to correct without visible pixels', () => {
		expect(measureLight(pixels([0, 0, 0], 0, 10))).toBeNull();
	});

	it('reduces a yellow cast of the light, partly', () => {
		const data = gradient([1, 0.95, 0.7]);
		const before = [channel(data, 250, 0), channel(data, 250, 2)];
		correctLight(data);
		const after = [channel(data, 250, 0), channel(data, 250, 2)];
		expect(after[0]! - after[1]!).toBeLessThan(before[0]! - before[1]!);
		// Partial: blue is lifted but stays below red.
		expect(after[1]!).toBeLessThan(after[0]!);
	});

	it('keeps a saturated object its colour', () => {
		const data = pixels([200, 30, 30], 100);
		correctLight(data);
		expect(channel(data, 0, 0)).toBeGreaterThan(150);
		expect(channel(data, 0, 1)).toBeLessThan(70);
	});

	it('lifts a dark object but keeps it dark', () => {
		const data = gradient([0.25, 0.25, 0.25]);
		const correction = measureLight(data)!;
		expect(correction.exponent).toBeLessThan(1);
		expect(correction.exponent).toBeGreaterThanOrEqual(0.8);
		const before = channel(data, 128, 0);
		correctLight(data);
		expect(channel(data, 128, 0)).toBeGreaterThan(before);
		expect(channel(data, 128, 0)).toBeLessThan(80);
	});

	it('adds depth to a dull grey shot, at most 1.5 times', () => {
		const data = Buffer.alloc(81 * 4);
		for (let v = 0; v < 81; v++) data.set([90 + v, 90 + v, 90 + v, 255], v * 4);
		expect(measureLight(data)!.contrast.scale).toBe(1.5);
	});

	it('leaves the soft shading of a bright object', () => {
		const data = Buffer.alloc(101 * 4);
		for (let v = 0; v < 101; v++) data.set([150 + v, 150 + v, 150 + v, 255], v * 4);
		expect(measureLight(data)!.contrast.scale).toBe(1);
	});

	it('ignores the background and leaves alpha as it is', () => {
		const object = pixels([120, 120, 120], 10);
		const edge = Buffer.from([255, 0, 0, 0, 0, 255, 0, 40]);
		expect(measureLight(Buffer.concat([object, edge]))).toEqual(measureLight(object));
		const data = Buffer.concat([object, edge]);
		correctLight(data);
		expect(data[43]).toBe(0);
		expect(data[47]).toBe(40);
	});
});
