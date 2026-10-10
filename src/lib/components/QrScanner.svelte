<script lang="ts">
	import jsQR from 'jsqr';
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

	function report(code: string) {
		const now = Date.now();
		if (code === last.code && now - last.at < REPEAT_MS) return;
		last = { code, at: now };
		onscan(code);
	}

	function tick() {
		frame = requestAnimationFrame(tick);
		if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return;
		canvas ??= document.createElement('canvas');
		const width = video.videoWidth;
		const height = video.videoHeight;
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.drawImage(video, 0, 0, width, height);
		const qr = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, {
			inversionAttempts: 'dontInvert'
		});
		if (!qr) return;
		const code = extractCode(qr.data);
		if (code) {
			hint = '';
			report(code);
		} else {
			hint = 'Это не наклейка Вещей';
		}
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

<div class="stack">
	{#if active && !cameraError}
		<div class="viewport">
			<video bind:this={video} playsinline muted></video>
		</div>
		{#if hint}<p class="muted">{hint}</p>{/if}
	{/if}
	{#if cameraError}
		<p class="error">{cameraError}</p>
		<button type="button" onclick={() => (cameraError = '')}>Попробовать снова</button>
	{/if}

	<form class="row" onsubmit={submitManual}>
		<input
			class="mono manual"
			bind:value={manual}
			placeholder="ID с наклейки, например K7M-4QX"
			autocapitalize="characters"
			autocomplete="off"
			spellcheck="false"
			aria-label="ID наклейки"
		/>
		<button type="submit">Открыть</button>
	</form>
	{#if manualError}<p class="error">{manualError}</p>{/if}
</div>

<style>
	.viewport {
		width: 100%;
		max-width: 28rem;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--radius);
		background: #000;
	}
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.manual {
		flex: 1;
		min-width: 12rem;
		width: auto;
	}
</style>
