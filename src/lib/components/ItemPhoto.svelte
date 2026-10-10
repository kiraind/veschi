<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { CameraPhotoOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';

	/**
	 * The item's own photo (falls back to showing the type photo) with upload,
	 * replace and remove; a new photo replaces the old one.
	 */
	let {
		itemId,
		photoKey,
		typePhotoKey = null,
		editable = true
	}: {
		itemId: string;
		photoKey: string | null;
		typePhotoKey?: string | null;
		editable?: boolean;
	} = $props();

	let busy = $state(false);
	let error = $state('');
	let input = $state<HTMLInputElement>();

	const shown = $derived(photoKey ?? typePhotoKey);

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function upload(target: HTMLInputElement) {
		const file = target.files?.[0];
		if (!file) return;
		const body = new FormData();
		body.set('file', file);
		run(() => api.put(`/api/items/${itemId}/photo`, body)).finally(() => (target.value = ''));
	}
</script>

<div class="space-y-2">
	{#if shown}
		<figure>
			<img
				class="max-h-72 w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800"
				src="/files/{shown}"
				alt={photoKey ? 'Фото вещи' : 'Фото типа'}
			/>
			{#if !photoKey}
				<figcaption class="mt-1 text-sm text-gray-500 dark:text-gray-400">Фото типа</figcaption>
			{/if}
		</figure>
	{/if}
	{#if editable}
		<div class="flex flex-wrap gap-2">
			<Button
				color="alternative"
				size="sm"
				disabled={busy}
				loading={busy}
				onclick={() => input?.click()}
			>
				<CameraPhotoOutline class="me-1.5 h-5 w-5" />
				{busy ? 'Загрузка…' : photoKey ? 'Заменить фото' : 'Сфотографировать вещь'}
			</Button>
			{#if photoKey}
				<Button
					color="red"
					outline
					size="sm"
					disabled={busy}
					onclick={() =>
						confirm('Удалить фото вещи?') && run(() => api.delete(`/api/items/${itemId}/photo`))}
				>
					<TrashBinOutline class="me-1.5 h-5 w-5" />
					Удалить фото
				</Button>
			{/if}
			<input
				bind:this={input}
				class="hidden"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				disabled={busy}
				onchange={(e) => upload(e.currentTarget)}
			/>
		</div>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
