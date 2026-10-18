<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Dropdown, DropdownItem, Spinner } from 'flowbite-svelte';
	import {
		CameraPhotoOutline,
		CheckOutline,
		EyeSlashOutline,
		ClipboardOutline,
		ImageOutline,
		PenOutline,
		TrashBinOutline
	} from 'flowbite-svelte-icons';
	import { errorText } from '$lib/api';
	import CameraCapture from './CameraCapture.svelte';
	import NoPhoto from './NoPhoto.svelte';
	import { confirmAction } from '$lib/confirm.svelte';
	import {
		canReadClipboardImages,
		ClipboardImageError,
		dragHasFiles,
		imageFromTransfer,
		pasteTargetsPage,
		readClipboardImage
	} from '$lib/clipboard-image';

	/**
	 * A photo (or a placeholder) with a small round button over its corner that opens
	 * a menu: «Сфотографировать» (our camera), «Выбрать файл», «Вставить из буфера»
	 * (where the browser can read clipboard images) and, when there is a photo,
	 * «Удалить фото». Ctrl/Cmd+V with an image on the page and an image file dropped
	 * onto the photo set it too. The caller saves: `onfile` / `onremove` (local unsaved files are shown through
	 * `previewUrl`).
	 *
	 * With `onnophoto`, a thing without a photo also gets «Фото не нужно» in the menu:
	 * the square placeholder collapses into a small strip with the same buttons
	 * (`noPhoto`); choosing it again brings the square back.
	 */
	let {
		photoKey = null,
		previewUrl = null,
		editable = true,
		onfile,
		onremove,
		caption,
		alt = 'Фото',
		container = false,
		corner,
		noPhoto = false,
		onnophoto
	}: {
		photoKey?: string | null;
		previewUrl?: string | null;
		editable?: boolean;
		onfile: (file: File) => Promise<void>;
		onremove?: () => Promise<void>;
		caption?: string;
		alt?: string;
		/** The placeholder without a photo is a box instead of a picture. */
		container?: boolean;
		/** Another round button, right above the photo menu button. */
		corner?: Snippet;
		/** «Фото не нужно»: without a photo, a strip with the buttons instead of the square. */
		noPhoto?: boolean;
		/** Turns «Фото не нужно» on or off; without it the menu has no such item. */
		onnophoto?: (noPhoto: boolean) => Promise<void>;
	} = $props();

	const uid = $props.id();
	const src = $derived(previewUrl ?? (photoKey ? `/files/${photoKey}` : null));
	const collapsed = $derived(noPhoto && !src);

	let menuOpen = $state(false);
	let cameraOpen = $state(false);
	let busy = $state(false);
	let error = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let canPaste = $state(false);
	/** Nested dragenter / dragleave over the photo and its buttons. */
	let dragDepth = $state(0);
	onMount(() => {
		canPaste = canReadClipboardImages();
	});

	async function run(action: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await action();
		} catch (e) {
			error = e instanceof ClipboardImageError ? e.message : errorText(e);
		} finally {
			busy = false;
		}
	}

	function take(file: File) {
		run(() => onfile(file));
	}

	function pasteFromMenu() {
		menuOpen = false;
		run(async () => onfile(await readClipboardImage()));
	}

	function onpaste(e: ClipboardEvent) {
		if (!editable || busy || e.defaultPrevented || !pasteTargetsPage()) return;
		const file = imageFromTransfer(e.clipboardData);
		if (!file) return;
		e.preventDefault();
		take(file);
	}

	function ondragenter(e: DragEvent) {
		if (!editable || busy || !dragHasFiles(e.dataTransfer)) return;
		e.preventDefault();
		dragDepth++;
	}

	function ondragover(e: DragEvent) {
		if (!editable || busy || !dragHasFiles(e.dataTransfer)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function ondragleave() {
		if (dragDepth > 0) dragDepth--;
	}

	function ondrop(e: DragEvent) {
		if (!editable || busy || !dragHasFiles(e.dataTransfer)) return;
		e.preventDefault();
		dragDepth = 0;
		const file = imageFromTransfer(e.dataTransfer);
		if (file) take(file);
		else error = 'Это не картинка';
	}

	async function remove() {
		menuOpen = false;
		if (onremove && (await confirmAction({ title: 'Удалить фото?' }))) run(onremove);
	}
</script>

<svelte:window {onpaste} />

<div class="space-y-1">
	<!-- Photos are square (uploads are padded to a square on the server). -->
	<!-- Full width on phones, up to 256 px on wider screens. -->
	<!-- «Фото не нужно»: a strip as wide, the same buttons in a row (the same elements, so the menu stays bound). -->
	<div
		class="relative w-full sm:max-w-64 {collapsed
			? 'flex items-center gap-2 rounded-lg bg-gray-100 p-2 text-gray-300 dark:bg-gray-800 dark:text-gray-600'
			: 'aspect-square'}"
		role="group"
		aria-label={alt}
		{ondragenter}
		{ondragover}
		{ondragleave}
		{ondrop}
	>
		{#if collapsed}
			<NoPhoto {container} class="ms-1 h-6 w-6 flex-none" />
			<span class="flex-1"></span>
		{:else if src}
			<img
				class="h-full w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800"
				{src}
				{alt}
			/>
		{:else}
			<div
				class="flex h-full w-full items-center justify-center rounded-lg bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600"
				aria-hidden="true"
			>
				<NoPhoto {container} class="h-16 w-16" />
			</div>
		{/if}

		{#if dragDepth > 0}
			<div
				class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary-500 bg-primary-50/95 text-center font-medium text-primary-700 dark:border-primary-400 dark:bg-gray-900/95 dark:text-primary-300 {collapsed
					? 'p-1 text-sm'
					: 'flex-col p-4'}"
			>
				<!-- The strip of «Фото не нужно» is too low for the big icon. -->
				{#if !collapsed}<ImageOutline class="h-10 w-10" />{/if}Отпустите, чтобы поставить фото
			</div>
		{/if}

		{#if busy}
			<div
				class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 dark:bg-gray-900/60"
			>
				<Spinner size="8" />
				<span class="sr-only">Загрузка…</span>
			</div>
		{/if}

		{#if corner}<div class={collapsed ? '' : 'absolute end-2 bottom-15'}>
				{@render corner()}
			</div>{/if}

		{#if editable}
			<button
				id="{uid}-photo-menu"
				type="button"
				class="{collapsed
					? ''
					: 'absolute end-2 bottom-2'} flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-700 shadow hover:bg-white focus:ring-4 focus:ring-primary-300 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-primary-800"
				aria-label="Изменить фото"
				disabled={busy}
			>
				{#if src}<PenOutline class="h-5 w-5" />{:else}<CameraPhotoOutline class="h-5 w-5" />{/if}
			</button>
			<Dropdown
				triggeredBy="#{uid}-photo-menu"
				bind:isOpen={menuOpen}
				placement="bottom-end"
				simple
				class="w-52"
			>
				<DropdownItem
					class="flex min-h-11 w-full items-center gap-2"
					onclick={() => {
						menuOpen = false;
						cameraOpen = true;
					}}
				>
					<CameraPhotoOutline class="h-5 w-5" />Сфотографировать
				</DropdownItem>
				<DropdownItem
					class="flex min-h-11 w-full items-center gap-2"
					onclick={() => {
						menuOpen = false;
						fileInput?.click();
					}}
				>
					<ImageOutline class="h-5 w-5" />Выбрать файл
				</DropdownItem>
				{#if canPaste}
					<DropdownItem class="flex min-h-11 w-full items-center gap-2" onclick={pasteFromMenu}>
						<ClipboardOutline class="h-5 w-5" />Вставить из буфера
					</DropdownItem>
				{/if}
				{#if !src && onnophoto}
					<DropdownItem
						class="flex min-h-11 w-full items-center gap-2"
						aria-pressed={noPhoto}
						onclick={() => {
							menuOpen = false;
							run(() => onnophoto(!noPhoto));
						}}
					>
						<EyeSlashOutline class="h-5 w-5" />Фото не нужно
						{#if noPhoto}<CheckOutline class="ms-auto h-5 w-5" />{/if}
					</DropdownItem>
				{/if}
				{#if src && onremove}
					<DropdownItem
						class="flex min-h-11 w-full items-center gap-2 text-red-600 dark:text-red-500"
						onclick={remove}
					>
						<TrashBinOutline class="h-5 w-5" />Удалить фото
					</DropdownItem>
				{/if}
			</Dropdown>
			<input
				bind:this={fileInput}
				class="hidden"
				type="file"
				accept="image/*"
				onchange={(e) => {
					const file = e.currentTarget.files?.[0];
					e.currentTarget.value = '';
					if (file) take(file);
				}}
			/>
			<CameraCapture bind:open={cameraOpen} oncapture={take} />
		{/if}
	</div>
	{#if caption}<p class="text-sm text-gray-500 dark:text-gray-400">{caption}</p>{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
