<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import ParamEditor from '$lib/components/ParamEditor.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import type { ParamInput } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { item, type, itemParams } = data.card;
	let typeId = $state<string | null>(type?.id ?? null);
	let typeName = $state(type?.name ?? '');
	let name = $state(item.name ?? '');
	let quantity = $state(item.quantity);
	let busy = $state(false);
	let error = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/items/${item.id}`, {
				...(typeId ? { typeId } : { newTypeName: typeName }),
				name,
				quantity
			});
			await goto(`/items/${item.id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveParams(params: ParamInput[]) {
		await api.put(`/api/items/${item.id}/params`, { params });
		await invalidateAll();
	}
</script>

<svelte:head><title>Изменить: {item.displayName} — Вещи</title></svelte:head>

<p><a href="/items/{item.id}">← {item.displayName}</a></p>
<h1>Изменить вещь</h1>

<form class="stack" onsubmit={save}>
	<TypeAutocomplete bind:typeId bind:typeName />
	<label>
		Своё название (необязательно)
		<input bind:value={name} placeholder={typeName} />
	</label>
	<label>
		Количество
		<input type="number" min="1" step="1" inputmode="numeric" bind:value={quantity} required />
	</label>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="row">
		<button class="primary" type="submit" disabled={busy || !typeName.trim()}>Сохранить</button>
		<a class="button" href="/items/{item.id}">Отмена</a>
	</div>
</form>

<h2>Свои параметры</h2>
<p class="muted">
	Параметры этой вещи (например, серийный номер). Параметр с тем же ключом, что у типа, заменяет
	значение типа.
	{#if type}Общие параметры — <a href="/types/{type.id}/edit">в типе «{type.name}»</a>.{/if}
</p>
<ParamEditor initial={itemParams} onsave={saveParams} />
