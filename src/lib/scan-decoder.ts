/**
 * Finds a sticker QR code and/or a packaging barcode in a video frame, for
 * QrScanner. Uses the browser's own BarcodeDetector where it knows every
 * needed format (Chrome on Android); otherwise jsQR for QR alone, or zxing
 * (WebAssembly, reads QR too) when barcodes are wanted. Both are loaded only
 * when the camera starts: they are the largest scripts of the app and most
 * pages never scan.
 */

import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader';

/** What was read: QR text, or barcode digits (`upcE`: read as UPC-E, maybe not expanded). */
export interface Decoded {
	kind: 'qr' | 'barcode';
	text: string;
	upcE?: boolean;
}

export type FrameDecoder = (video: HTMLVideoElement) => Promise<Decoded | null>;

/** Frames are scaled down to this many pixels on the longer side: a full HD frame
 *  costs several times more, and a 20 mm sticker still reads from about 8% of the width. */
const SCAN_SIZE = 960;

const NATIVE_BARCODES = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

interface NativeDetector {
	detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}

interface NativeDetectorClass {
	new (options: { formats: string[] }): NativeDetector;
	getSupportedFormats(): Promise<string[]>;
}

/** The current frame of the video, scaled down to SCAN_SIZE. */
function frameReader() {
	let canvas: HTMLCanvasElement | null = null;
	return (source: HTMLVideoElement): ImageData | null => {
		const scale = Math.min(1, SCAN_SIZE / Math.max(source.videoWidth, source.videoHeight));
		const width = Math.round(source.videoWidth * scale);
		const height = Math.round(source.videoHeight * scale);
		canvas ??= document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0, width, height);
		return ctx.getImageData(0, 0, width, height);
	};
}

/** zxing with its WebAssembly file served by the app itself, not by the library's CDN; set up once. */
let zxing: Promise<typeof import('zxing-wasm/reader')> | null = null;

function loadZxing() {
	zxing ??= Promise.all([
		import('zxing-wasm/reader'),
		import('zxing-wasm/reader/zxing_reader.wasm?url')
	]).then(([lib, { default: wasmUrl }]) => {
		lib.prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith('.wasm') ? wasmUrl : prefix + path
			}
		});
		return lib;
	});
	// A failed load is tried again next time.
	zxing.catch(() => (zxing = null));
	return zxing;
}

async function zxingDecoder(stickers: boolean): Promise<FrameDecoder> {
	const { readBarcodes } = await loadZxing();
	const formats: ReadInputBarcodeFormat[] = ['EAN13', 'EAN8', 'UPCA', 'UPCE'];
	if (stickers) formats.push('QRCode');
	const frame = frameReader();
	return async (source) => {
		const image = frame(source);
		if (!image) return null;
		const [found] = await readBarcodes(image, { formats, maxNumberOfSymbols: 1 });
		if (!found?.isValid) return null;
		return found.format === 'QRCode'
			? { kind: 'qr', text: found.text }
			: { kind: 'barcode', text: found.text, upcE: found.format === 'UPCE' };
	};
}

async function jsqrDecoder(): Promise<FrameDecoder> {
	const { default: jsQR } = await import('jsqr');
	const frame = frameReader();
	return async (source) => {
		const image = frame(source);
		if (!image) return null;
		const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
		return qr ? { kind: 'qr', text: qr.data } : null;
	};
}

/** A decoder for sticker QR codes (`stickers`), packaging barcodes (`barcodes`) or both. */
export async function createFrameDecoder({
	stickers,
	barcodes
}: {
	stickers: boolean;
	barcodes: boolean;
}): Promise<FrameDecoder> {
	const wanted = [...(stickers ? ['qr_code'] : []), ...(barcodes ? NATIVE_BARCODES : [])];
	const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
	const supported = Detector ? await Detector.getSupportedFormats().catch((): string[] => []) : [];
	if (Detector && wanted.every((f) => supported.includes(f))) {
		const detector = new Detector({ formats: wanted });
		return async (source) => {
			const [found] = await detector.detect(source);
			if (!found) return null;
			return found.format === 'qr_code'
				? { kind: 'qr', text: found.rawValue }
				: { kind: 'barcode', text: found.rawValue, upcE: found.format === 'upc_e' };
		};
	}
	return barcodes ? zxingDecoder(stickers) : jsqrDecoder();
}
