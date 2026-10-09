<script lang="ts">
	import { invalidateAll } from '$app/navigation';
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

<div class="stack photo">
	{#if photoKey}
		<img src="/files/{photoKey}" alt="Фото типа" />
	{/if}
	<div class="row">
		<label class="button">
			{busy ? 'Загрузка…' : photoKey ? 'Заменить фото' : 'Добавить фото'}
			<input
				class="hidden"
				type="file"
				accept="image/*"
				disabled={busy}
				onchange={(e) => upload(e.currentTarget)}
			/>
		</label>
		{#if photoKey}
			<button
				type="button"
				class="danger"
				disabled={busy}
				onclick={() =>
					confirm('Удалить фото?') && run(() => api.delete(`/api/types/${typeId}/photo`))}
			>
				Удалить фото
			</button>
		{/if}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	img {
		width: 100%;
		max-height: 60vh;
		object-fit: contain;
		border-radius: var(--radius);
		background: var(--surface);
	}
	label.button {
		flex-direction: row;
		color: var(--text);
		font-size: 1rem;
	}
	.hidden {
		display: none;
	}
</style>
