<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import Thumb from '$lib/components/Thumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let filter = $state('');
	let name = $state('');
	let error = $state('');
	let busy = $state(false);

	const shown = $derived(
		data.types.filter((t) =>
			t.name.toLocaleLowerCase('ru').includes(filter.trim().toLocaleLowerCase('ru'))
		)
	);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/types', { name });
			await goto(`/types/${id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Типы — Вещи</title></svelte:head>

<h1>Типы</h1>
<p class="muted">
	Тип описывает, что это за вещь: название, фото и общие параметры всех её экземпляров.
</p>

<form class="row" onsubmit={create}>
	<input
		class="grow"
		bind:value={name}
		placeholder="Новый тип, например «Нож Victorinox»"
		required
	/>
	<button class="primary" type="submit" disabled={busy}>Создать</button>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if data.types.length > 10}
	<input
		class="filter"
		type="search"
		bind:value={filter}
		placeholder="Фильтр"
		aria-label="Фильтр"
	/>
{/if}

<ul class="list">
	{#each shown as type (type.id)}
		<li class="card row entry">
			<Thumb photoKey={type.photoKey} size={40} />
			<a class="grow" href="/types/{type.id}">{type.name}</a>
			<span class="muted">{type.itemCount} зап.</span>
		</li>
	{:else}
		<li class="muted">Типов нет.</li>
	{/each}
</ul>

<style>
	.grow {
		flex: 1;
		min-width: 0;
	}
	.filter {
		margin: 1rem 0 0.5rem;
	}
	form {
		margin-bottom: 1rem;
		flex-wrap: nowrap;
	}
	.entry {
		padding: 0.5rem 0.75rem;
		flex-wrap: nowrap;
	}
</style>
