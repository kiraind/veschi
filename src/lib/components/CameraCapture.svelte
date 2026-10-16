<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Modal } from 'flowbite-svelte';
	import Notice from './Notice.svelte';
	import { CloseOutline, ImageOutline, RefreshOutline } from 'flowbite-svelte-icons';
	import { centerSquare } from '$lib/domain/photo';

	/**
	 * Our own camera in a modal (full screen on phones): live preview from the back
	 * camera, a shutter, a camera switch, then «Переснять» / «Использовать». Photos
	 * are square, so the preview shows the centered square of the frame and the shot
	 * is exactly that square: a JPEG with the side ≤ MAX_SIDE. Without a camera (plain HTTP, no
	 * permission, no device) it explains why and offers «Выбрать файл».
	 */
	let { open = $bindable(false), oncapture }: { open?: boolean; oncapture: (file: File) => void } =
		$props();

	const MAX_SIDE = 2048;
	const QUALITY = 0.9;

	let video: HTMLVideoElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();
	let cameraError = $state('');
	let ready = $state(false);
	let shot = $state<{ file: File; url: string } | null>(null);
	let devices = $state<MediaDeviceInfo[]>([]);
	let deviceId = $state<string | null>(null);

	let stream: MediaStream | null = null;
	/** Bumped by stop(), so a camera granted after closing is released at once. */
	let session = 0;

	function describeError(e: unknown): string {
		const name = e instanceof DOMException ? e.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			return 'Нет доступа к камере. Разрешите его в настройках браузера или выберите файл.';
		}
		if (name === 'NotFoundError' || name === 'OverconstrainedError') {
			return 'Камера не найдена. Выберите файл с фото.';
		}
		if (name === 'NotReadableError') {
			return 'Камера занята другим приложением. Закройте его или выберите файл.';
		}
		return 'Камера недоступна. Выберите файл с фото.';
	}

	async function start(wanted: string | null) {
		const id = ++session;
		cameraError = '';
		ready = false;
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraError = 'Браузер не даёт доступ к камере (нужен HTTPS). Выберите файл с фото.';
			return;
		}
		try {
			const media = await navigator.mediaDevices.getUserMedia({
				video: {
					...(wanted ? { deviceId: { exact: wanted } } : { facingMode: 'environment' }),
					width: { ideal: 1920 },
					height: { ideal: 1920 }
				},
				audio: false
			});
			if (id !== session || !video) {
				media.getTracks().forEach((t) => t.stop());
				return;
			}
			stream = media;
			video.srcObject = media;
			await video.play();
			if (id !== session) return;
			ready = true;
			deviceId = media.getVideoTracks()[0]?.getSettings().deviceId ?? wanted;
			// Labels and the full list are known only after permission is granted.
			const all = await navigator.mediaDevices.enumerateDevices();
			if (id === session) devices = all.filter((d) => d.kind === 'videoinput');
		} catch (e) {
			if (id !== session) return;
			stop();
			cameraError = describeError(e);
		}
	}

	function stop() {
		session++;
		ready = false;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	// The camera runs while the modal is open and no shot is being reviewed; the
	// cleanup (also on destroy) releases it.
	$effect(() => {
		if (open && video && !shot && !cameraError) {
			untrack(() => start(deviceId));
			return stop;
		}
	});

	// Forget the shot and the error when the modal closes.
	$effect(() => {
		if (!open) {
			discard();
			cameraError = '';
		}
	});

	function discard() {
		if (shot) URL.revokeObjectURL(shot.url);
		shot = null;
	}

	function switchCamera() {
		if (devices.length < 2) return;
		const index = devices.findIndex((d) => d.deviceId === deviceId);
		stop();
		deviceId = devices[(index + 1) % devices.length]?.deviceId ?? null;
		start(deviceId);
	}

	function capture() {
		if (!video || !ready) return;
		const width = video.videoWidth;
		const height = video.videoHeight;
		if (!width || !height) return;
		const { sx, sy, side, size } = centerSquare(width, height, MAX_SIDE);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					cameraError = 'Не удалось сделать снимок. Попробуйте ещё раз или выберите файл.';
					return;
				}
				const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
				shot = { file, url: URL.createObjectURL(blob) };
			},
			'image/jpeg',
			QUALITY
		);
	}

	function finish(file: File) {
		oncapture(file);
		open = false;
	}

	function retry() {
		cameraError = '';
	}
</script>

<Modal
	bind:open
	dismissable={false}
	size="sm"
	class="max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none"
	classes={{ body: 'flex flex-1 flex-col gap-3 p-3 md:p-4' }}
>
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Фото</h3>
		<Button
			type="button"
			color="alternative"
			class="h-10 w-10 p-0"
			aria-label="Закрыть"
			onclick={() => (open = false)}
		>
			<CloseOutline class="h-5 w-5" />
		</Button>
	</div>

	{#if cameraError}
		<Notice tone="warning">
			<p>{cameraError}</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<Button type="button" size="sm" class="h-10" onclick={() => fileInput?.click()}>
					<ImageOutline class="me-1.5 h-5 w-5" />Выбрать файл
				</Button>
				<Button type="button" size="sm" class="h-10" color="alternative" onclick={retry}>
					Попробовать снова
				</Button>
			</div>
		</Notice>
	{:else}
		<!-- A square, like the photo will be: the frame is cropped (object-cover), not fitted. -->
		<div
			class="relative mx-auto flex aspect-square w-full max-w-[min(100%,70dvh)] items-center justify-center overflow-hidden rounded-lg bg-black"
		>
			<video
				class="h-full w-full object-cover {shot ? 'hidden' : ''}"
				bind:this={video}
				playsinline
				muted
			></video>
			{#if shot}
				<img class="h-full w-full object-cover" src={shot.url} alt="Снимок" />
			{:else if !ready}
				<p class="absolute text-sm text-gray-300">Включаем камеру…</p>
			{/if}
		</div>

		{#if shot}
			<div class="grid grid-cols-2 gap-2">
				<Button type="button" color="alternative" onclick={discard}>Переснять</Button>
				<Button type="button" onclick={() => shot && finish(shot.file)}>Использовать</Button>
			</div>
		{:else}
			<div class="grid grid-cols-3 items-center">
				<Button
					type="button"
					color="alternative"
					size="sm"
					class="h-10 justify-self-start"
					onclick={() => fileInput?.click()}
				>
					<ImageOutline class="me-1 h-5 w-5" />Файл
				</Button>
				<button
					type="button"
					class="h-16 w-16 justify-self-center rounded-full border-4 border-gray-300 bg-white shadow focus:ring-4 focus:ring-primary-300 focus:outline-none active:scale-95 disabled:opacity-50 dark:border-gray-600 dark:focus:ring-primary-800"
					aria-label="Сделать снимок"
					disabled={!ready}
					onclick={capture}
				></button>
				{#if devices.length > 1}
					<Button
						type="button"
						color="alternative"
						class="h-12 w-12 justify-self-end rounded-full p-0"
						aria-label="Другая камера"
						disabled={!ready}
						onclick={switchCamera}
					>
						<RefreshOutline class="h-6 w-6" />
					</Button>
				{/if}
			</div>
		{/if}
	{/if}

	<input
		bind:this={fileInput}
		class="hidden"
		type="file"
		accept="image/*"
		onchange={(e) => {
			const file = e.currentTarget.files?.[0];
			e.currentTarget.value = '';
			if (file) finish(file);
		}}
	/>
</Modal>
