/**
 * Light correction of a cutout (docs/decisions.md, «Обработка фото»): white
 * balance, contrast and a gamma towards a mid-tone, computed over the pixels of
 * the object only (the background is already transparent, so it cannot skew
 * the statistics). Every step is clamped and partial: a red mug must stay red
 * and black boots black, the correction only removes a cast and a dull exposure.
 */

/** Pixels with less alpha are background or a soft edge and do not count. */
const OBJECT_ALPHA = 128;
/** Share of the brightest object pixels taken as the colour of the light. */
const HIGHLIGHT_SHARE = 0.03;
/** Per-channel white balance gains stay within this range… */
const GAIN_MIN = 0.85;
const GAIN_MAX = 1.15;
/** …and are applied this strongly (1 = the full gray-highlight correction). */
const GAIN_STRENGTH = 0.7;
/**
 * Contrast is stretched around the median until the object's 1st or 99th
 * luminance percentile reaches these values, at most MAX_STRETCH times: a dull
 * grey shot gets depth, a white mug keeps its soft shading and black boots
 * are not turned grey.
 */
const LEVEL_LOW = 12;
const LEVEL_HIGH = 243;
const MAX_STRETCH = 1.5;
/** The gamma moves the median luminance halfway towards this value (0–1)… */
const MEDIAN_TARGET = 0.45;
const GAMMA_STRENGTH = 0.5;
/** …within these limits of the exponent (below 1 brightens). */
const EXPONENT_MIN = 0.8;
const EXPONENT_MAX = 1.25;

export interface LightCorrection {
	/** Multipliers of R, G, B. */
	gains: [number, number, number];
	/** Contrast: values move away from `pivot` `scale` times. */
	contrast: { pivot: number; scale: number };
	/** Exponent of the gamma curve over 0–1 values: below 1 brightens the mid-tones. */
	exponent: number;
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function percentile(histogram: Uint32Array, total: number, share: number): number {
	const goal = total * share;
	let seen = 0;
	for (let v = 0; v < histogram.length; v++) {
		seen += histogram[v]!;
		if (seen >= goal) return v;
	}
	return histogram.length - 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The correction for an RGBA buffer, or null when the object has no pixels. */
export function measureLight(rgba: Buffer | Uint8Array): LightCorrection | null {
	const histogram = new Uint32Array(256);
	let total = 0;
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3]! < OBJECT_ALPHA) continue;
		histogram[Math.round(luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!))]!++;
		total++;
	}
	if (total === 0) return null;

	// White balance: the highlights reflect the light, so their colour is its colour.
	const highlight = percentile(histogram, total, 1 - HIGHLIGHT_SHARE);
	const sum: [number, number, number] = [0, 0, 0];
	let count = 0;
	for (let i = 0; i < rgba.length; i += 4) {
		const [r, g, b] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
		if (rgba[i + 3]! < OBJECT_ALPHA || Math.round(luma(r, g, b)) < highlight) continue;
		sum[0] += r;
		sum[1] += g;
		sum[2] += b;
		count++;
	}
	const mean = sum.map((s) => s / count) as [number, number, number];
	const gray = (mean[0] + mean[1] + mean[2]) / 3;
	const gains = mean.map((m) =>
		m === 0 ? 1 : 1 + (clamp(gray / m, GAIN_MIN, GAIN_MAX) - 1) * GAIN_STRENGTH
	) as [number, number, number];

	// Contrast around the median, only as far as the darkest and brightest parts allow.
	const lo = percentile(histogram, total, 0.01);
	const median = percentile(histogram, total, 0.5);
	const hi = percentile(histogram, total, 0.99);
	const room = Math.min(
		median > lo ? (median - LEVEL_LOW) / (median - lo) : Infinity,
		hi > median ? (LEVEL_HIGH - median) / (hi - median) : Infinity
	);
	const scale = Number.isFinite(room) ? clamp(room, 1, MAX_STRETCH) : 1;

	// Gamma: the median moved part of the way to the target.
	const full = Math.log(MEDIAN_TARGET) / Math.log(clamp(median / 255, 0.02, 0.98));
	const exponent = clamp(1 + (full - 1) * GAMMA_STRENGTH, EXPONENT_MIN, EXPONENT_MAX);

	return { gains, contrast: { pivot: median, scale }, exponent };
}

/** Lookup tables of the correction, one per channel. */
export function lightTables(c: LightCorrection): [Uint8Array, Uint8Array, Uint8Array] {
	const { pivot, scale } = c.contrast;
	return c.gains.map((gain) => {
		const table = new Uint8Array(256);
		for (let v = 0; v < 256; v++) {
			const unit = clamp((pivot + (v * gain - pivot) * scale) / 255, 0, 1);
			table[v] = Math.round(255 * unit ** c.exponent);
		}
		return table;
	}) as [Uint8Array, Uint8Array, Uint8Array];
}

/** Corrects the colour of an RGBA buffer in place; alpha is left as it is. */
export function correctLight(rgba: Buffer | Uint8Array): LightCorrection | null {
	const correction = measureLight(rgba);
	if (!correction) return null;
	const [r, g, b] = lightTables(correction);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i] = r[rgba[i]!]!;
		rgba[i + 1] = g[rgba[i + 1]!]!;
		rgba[i + 2] = b[rgba[i + 2]!]!;
	}
	return correction;
}
