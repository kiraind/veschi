<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { ImageOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';

	/** Uploads (or removes) the single photo of a type; a new photo replaces the old one. */
	let { typeId, photoKey }: { typeId: string; photoKey: string | null } = $props();

	let busy = $state(false);
	let error = $state('');

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

	function upload(input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		const body = new FormData();
		body.set('file', file);
		run(() => api.put(`/api/types/${typeId}/photo`, body)).finally(() => (input.value = ''));
	}
</script>

<div class="flex flex-col gap-2">
	{#if photoKey}
		<img
			class="max-h-[60vh] w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800"
			src="/files/{photoKey}"
			alt="Фото типа"
		/>
	{/if}
	<div class="flex flex-wrap gap-2">
		<Button tag="label" color="alternative" disabled={busy} class="cursor-pointer">
			<ImageOutline class="me-1 h-4 w-4" />
			{busy ? 'Загрузка…' : photoKey ? 'Заменить фото' : 'Добавить фото'}
			<input
				class="hidden"
				type="file"
				accept="image/*"
				disabled={busy}
				onchange={(e) => upload(e.currentTarget)}
			/>
		</Button>
		{#if photoKey}
			<Button
				type="button"
				color="red"
				outline
				disabled={busy}
				onclick={() =>
					confirm('Удалить фото?') && run(() => api.delete(`/api/types/${typeId}/photo`))}
			>
				<TrashBinOutline class="me-1 h-4 w-4" />Удалить фото
			</Button>
		{/if}
	</div>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
