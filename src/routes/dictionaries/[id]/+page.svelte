<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import OptionListEditor from '$lib/components/OptionListEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { dictionary } = data;
	let name = $state(dictionary.name);
	let multiple = $state(dictionary.multiple);
	let options = $state(dictionary.options.map((o) => ({ ...o })));
	let busy = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>, next: string) {
		busy = true;
		error = '';
		try {
			await action();
			await goto(next);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const body = { name, multiple, options: options.map(({ id, label }) => ({ id, label })) };
		run(() => api.put(`/api/dictionaries/${dictionary.id}`, body), '/dictionaries');
	}

	function remove() {
		if (!confirm(`Удалить справочник «${dictionary.name}»?`)) return;
		run(() => api.delete(`/api/dictionaries/${dictionary.id}`), '/dictionaries');
	}
</script>

<svelte:head><title>{dictionary.name} — Справочники</title></svelte:head>

<p><a href="/dictionaries">← Справочники</a></p>
<h1>{dictionary.name}</h1>

<form class="stack" onsubmit={save}>
	<label>
		Название
		<input bind:value={name} required />
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={multiple} />
		Можно выбрать несколько вариантов
	</label>
	<span class="muted">
		Варианты. Переименование видно сразу во всех параметрах; используемый вариант удалить нельзя.
	</span>
	<OptionListEditor bind:options />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="row">
		<button class="primary" type="submit" disabled={busy}>Сохранить</button>
		<a class="button" href="/dictionaries">Отмена</a>
	</div>
</form>

<div class="danger-zone">
	{#if dictionary.usage > 0}
		<p class="muted">Используется в параметрах: {dictionary.usage}. Удалить нельзя.</p>
	{:else}
		<button class="danger" onclick={remove} disabled={busy}>Удалить справочник</button>
	{/if}
</div>

<style>
	.check {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		color: var(--text);
	}
	.danger-zone {
		margin-top: 2rem;
	}
</style>
