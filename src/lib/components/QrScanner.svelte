<script lang="ts">
	import { Alert, Button, Input } from 'flowbite-svelte';
	import { extractCode } from '$lib/domain/scan';
	import { normalizeCode } from '$lib/domain/sticker-code';

	let { onscan, active = true }: { onscan: (code: string) => void; active?: boolean } = $props();

	/** The same code is reported again only after this pause, so one QR does not fire repeatedly. */
	const REPEAT_MS = 2000;

	let video: HTMLVideoElement | undefined = $state();
	let cameraError = $state('');
	let hint = $state('');
	let manual = $state('');
	let manualError = $state('');

	let stream: MediaStream | null = null;
	let frame = 0;
	/** Bumped by stop(), so a camera granted after deactivation is released at once. */
	let session = 0;
	let canvas: HTMLCanvasElement | null = null;
	let last = { code: '', at: 0 };
	/** Finds a QR code in the current video frame; set up when the camera starts. */
	let decoder: Promise<(video: HTMLVideoElement) => Promise<string | null>> | null = null;
	let decode: ((video: HTMLVideoElement) => Promise<string | null>) | null = null;
	let decoding = false;

	/** jsQR gets frames scaled down to this many pixels on the longer side: a full HD frame
	 *  costs several times more, and a 20 mm sticker still reads from about 8% of the width. */
	const SCAN_SIZE = 960;

	/**
	 * The browser's own QR detector where there is one (Chrome on Android), otherwise
	 * jsQR, loaded only now: it is the largest script of the app and most pages never scan.
	 */
	async function createDecoder(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
		const Detector = (
			globalThis as {
				BarcodeDetector?: {
					new (options: { formats: string[] }): {
						detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
					};
					getSupportedFormats(): Promise<string[]>;
				};
			}
		).BarcodeDetector;
		if (
			Detector &&
			(await Detector.getSupportedFormats().catch((): string[] => [])).includes('qr_code')
		) {
			const detector = new Detector({ formats: ['qr_code'] });
			return async (source) => (await detector.detect(source))[0]?.rawValue ?? null;
		}
		const { default: jsQR } = await import('jsqr');
		return async (source) => {
			const scale = Math.min(1, SCAN_SIZE / Math.max(source.videoWidth, source.videoHeight));
			const width = Math.round(source.videoWidth * scale);
			const height = Math.round(source.videoHeight * scale);
			canvas ??= document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return null;
			ctx.drawImage(source, 0, 0, width, height);
			const qr = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, {
				inversionAttempts: 'dontInvert'
			});
			return qr?.data ?? null;
		};
	}

	function report(code: string) {
		const now = Date.now();
		if (code === last.code && now - last.at < REPEAT_MS) return;
		last = { code, at: now };
		onscan(code);
	}

	function tick() {
		frame = requestAnimationFrame(tick);
		if (decoding || !decode || !video || video.readyState < video.HAVE_ENOUGH_DATA) return;
		decoding = true;
		const id = session;
		decode(video)
			.then((data) => {
				if (data === null || id !== session) return;
				const code = extractCode(data);
				if (code) {
					hint = '';
					report(code);
				} else {
					hint = 'Это не наклейка Вещей';
				}
			})
			.catch(() => {})
			.finally(() => (decoding = false));
	}

	function describeError(e: unknown): string {
		const name = e instanceof DOMException ? e.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			return 'Нет доступа к камере. Разрешите его в настройках браузера или введите ID вручную.';
		}
		if (name === 'NotFoundError' || name === 'OverconstrainedError') {
			return 'Камера не найдена. Введите ID вручную.';
		}
		return 'Камера недоступна. Введите ID вручную.';
	}

	async function start() {
		const id = ++session;
		cameraError = '';
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraError = 'Браузер не даёт доступ к камере (нужен HTTPS). Введите ID вручную.';
			return;
		}
		// Loaded while the person answers the camera prompt; a failed load is retried next time.
		decoder ??= createDecoder().catch((e) => {
			decoder = null;
			throw e;
		});
		try {
			const media = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
			if (id !== session || !video) {
				media.getTracks().forEach((t) => t.stop());
				return;
			}
			stream = media;
			video.srcObject = media;
			await video.play();
			decode = await decoder;
			if (id !== session) return;
			frame = requestAnimationFrame(tick);
		} catch (e) {
			if (id !== session) return;
			stop();
			cameraError = describeError(e);
		}
	}

	function stop() {
		session++;
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	// Runs while the scanner is active and the video element exists; the cleanup
	// (also on destroy) stops the camera.
	$effect(() => {
		if (active && video) {
			start();
			return stop;
		}
	});

	function submitManual(event: SubmitEvent) {
		event.preventDefault();
		const code = normalizeCode(manual) ?? extractCode(manual);
		if (!code) {
			manualError = 'ID — 6 символов, например K7M-4QX (без 0, O, 1, I, L)';
			return;
		}
		manualError = '';
		manual = '';
		onscan(code);
	}
</script>

<div class="flex flex-col gap-3">
	{#if active && !cameraError}
		<div class="aspect-square w-full max-w-md overflow-hidden rounded-lg bg-black">
			<video class="h-full w-full object-cover" bind:this={video} playsinline muted></video>
		</div>
		{#if hint}<p class="text-sm text-gray-500 dark:text-gray-400">{hint}</p>{/if}
	{/if}
	{#if cameraError}
		<Alert color="yellow">
			<p>{cameraError}</p>
			<Button
				class="h-10 mt-3"
				size="sm"
				color="alternative"
				type="button"
				onclick={() => (cameraError = '')}
			>
				Попробовать снова
			</Button>
		</Alert>
	{/if}

	<form class="flex flex-wrap gap-2" onsubmit={submitManual}>
		<div class="min-w-48 flex-1">
			<Input
				class="font-mono"
				bind:value={manual}
				placeholder="ID с наклейки, например K7M-4QX"
				autocapitalize="characters"
				autocomplete="off"
				spellcheck="false"
				aria-label="ID наклейки"
			/>
		</div>
		<Button type="submit">Открыть</Button>
	</form>
	{#if manualError}
		<p class="text-sm text-red-600 dark:text-red-500" role="alert">{manualError}</p>
	{/if}
</div>
