<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import Notice from './Notice.svelte';
	import { normalizeBarcode, NOT_A_BARCODE } from '$lib/domain/barcode';
	import { extractCode } from '$lib/domain/scan';
	import { normalizeCode } from '$lib/domain/sticker-code';
	import { createFrameDecoder, type FrameDecoder } from '$lib/scan-decoder';

	/**
	 * Camera scanner with a field for typing the code. `onscan` gets sticker
	 * IDs (QR codes), `onbarcode` packaging barcodes (EAN/UPC) in stored form;
	 * the scanner looks for the kinds it has a handler for.
	 */
	let {
		onscan,
		onbarcode,
		active = true,
		submitLabel = 'Открыть'
	}: {
		onscan?: (code: string) => void;
		onbarcode?: (code: string) => void;
		active?: boolean;
		/** The button next to the field for a typed code. */
		submitLabel?: string;
	} = $props();

	/** The same code is reported again only after this pause, so one QR does not fire repeatedly. */
	const REPEAT_MS = 2000;

	/** What the person can type instead, for the field and the camera messages. */
	const manualWhat = $derived(
		onscan && onbarcode ? 'ID или штрихкод' : onbarcode ? 'цифры штрихкода' : 'ID'
	);

	let video: HTMLVideoElement | undefined = $state();
	let cameraError = $state('');
	let hint = $state('');
	let manual = $state('');
	let manualError = $state('');

	let stream: MediaStream | null = null;
	let frame = 0;
	/** Bumped by stop(), so a camera granted after deactivation is released at once. */
	let session = 0;
	let last = { code: '', at: 0 };
	/** Finds a code in the current video frame; set up when the camera starts. */
	let decoder: Promise<FrameDecoder> | null = null;
	let decode: FrameDecoder | null = null;
	let decoding = false;

	function report(code: string, handler: (code: string) => void) {
		const now = Date.now();
		if (code === last.code && now - last.at < REPEAT_MS) return;
		last = { code, at: now };
		handler(code);
	}

	function tick() {
		frame = requestAnimationFrame(tick);
		if (decoding || !decode || !video || video.readyState < video.HAVE_ENOUGH_DATA) return;
		decoding = true;
		const id = session;
		decode(video)
			.then((found) => {
				if (found === null || id !== session) return;
				if (found.kind === 'qr') {
					const code = extractCode(found.text);
					if (code && onscan) {
						hint = '';
						report(code, onscan);
					} else {
						hint = 'Это не наклейка Вещей';
					}
				} else {
					const code = normalizeBarcode(found.text, { upcE: found.upcE });
					if (code && onbarcode) {
						hint = '';
						report(code, onbarcode);
					}
				}
			})
			.catch(() => {})
			.finally(() => (decoding = false));
	}

	function describeError(e: unknown): string {
		const name = e instanceof DOMException ? e.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			return `Нет доступа к камере. Разрешите его в настройках браузера или введите ${manualWhat} вручную.`;
		}
		if (name === 'NotFoundError' || name === 'OverconstrainedError') {
			return `Камера не найдена. Введите ${manualWhat} вручную.`;
		}
		return `Камера недоступна. Введите ${manualWhat} вручную.`;
	}

	async function start() {
		const id = ++session;
		cameraError = '';
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraError = `Браузер не даёт доступ к камере (нужен HTTPS). Введите ${manualWhat} вручную.`;
			return;
		}
		// Loaded while the person answers the camera prompt; a failed load is retried next time.
		decoder ??= createFrameDecoder({ stickers: !!onscan, barcodes: !!onbarcode }).catch((e) => {
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
		// A sticker ID has 6 characters and a barcode 8 or more digits, so they never clash.
		const sticker = onscan ? (normalizeCode(manual) ?? extractCode(manual)) : null;
		const digits = /^[\d\s-]+$/.test(manual.trim());
		if (sticker && onscan) {
			manualError = '';
			manual = '';
			onscan(sticker);
		} else if (onbarcode && (digits || !onscan)) {
			const code = normalizeBarcode(manual);
			if (!code) {
				manualError = NOT_A_BARCODE;
				return;
			}
			manualError = '';
			manual = '';
			onbarcode(code);
		} else {
			manualError = 'ID — 6 символов, например K7M-4QX (без 0, O, 1, I, L)';
		}
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
		<Notice tone="warning">
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
		</Notice>
	{/if}

	<form class="flex flex-wrap gap-2" onsubmit={submitManual}>
		<div class="min-w-48 flex-1">
			<Input
				class="font-mono"
				bind:value={manual}
				placeholder={onscan && onbarcode
					? 'ID наклейки или цифры штрихкода'
					: onbarcode
						? 'Цифры под штрихкодом'
						: 'ID с наклейки, например K7M-4QX'}
				inputmode={onscan ? undefined : 'numeric'}
				autocapitalize="characters"
				autocomplete="off"
				spellcheck="false"
				aria-label={onscan && onbarcode
					? 'ID наклейки или штрихкод'
					: onbarcode
						? 'Штрихкод'
						: 'ID наклейки'}
			/>
		</div>
		<Button type="submit">{submitLabel}</Button>
	</form>
	{#if manualError}
		<p class="text-sm text-red-600 dark:text-red-500" role="alert">{manualError}</p>
	{/if}
</div>
