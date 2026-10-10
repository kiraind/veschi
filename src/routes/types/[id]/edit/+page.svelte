<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import ParamEditor from '$lib/components/ParamEditor.svelte';
	import type { ParamInput } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { type, params } = data.card;
	let name = $state(type.name);
	let busy = $state(false);
	let error = $state('');

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/types/${type.id}`, { name });
			await goto(`/types/${type.id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveParams(list: ParamInput[]) {
		await api.put(`/api/types/${type.id}/params`, { params: list });
		await invalidateAll();
	}
</script>

<svelte:head><title>Изменить тип: {type.name} — Вещи</title></svelte:head>

<p><a href="/types/{type.id}">← {type.name}</a></p>
<h1>Изменить тип</h1>

<form class="stack" onsubmit={rename}>
	<label>
		Название
		<input bind:value={name} required />
	</label>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="row">
		<button class="primary" type="submit" disabled={busy}>Сохранить название</button>
	</div>
</form>

<h2>Параметры типа</h2>
<p class="muted">Видны у всех вещей этого типа.</p>
<ParamEditor initial={params} onsave={saveParams} />
