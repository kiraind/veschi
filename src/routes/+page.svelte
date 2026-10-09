<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchResults from '$lib/components/SearchResults.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Initialised from the URL once; afterwards the input drives the URL.
	// svelte-ignore state_referenced_locally
	let query = $state(data.q);

	$effect(() => {
		const q = query.trim();
		if (q === data.q.trim()) return;
		const timer = setTimeout(() => {
			const url = q ? `/?q=${encodeURIComponent(q)}` : '/';
			goto(url, { replaceState: true, keepFocus: true, noScroll: true });
		}, 300);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head><title>Поиск — Вещи</title></svelte:head>

<form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
	<input
		type="search"
		bind:value={query}
		placeholder="Что ищем? Например, NE555 или «корпус: DIP-8»"
		aria-label="Поиск"
		autocomplete="off"
	/>
</form>

{#if !data.q.trim()}
	<p class="muted">
		Ищите по названию вещи или типа и по параметрам. Чтобы искать по конкретному параметру, пишите
		«ключ: значение».
	</p>
	<div class="row">
		<a class="button" href="/scan">Сканировать</a>
		<a class="button" href="/items/new">Новая вещь</a>
	</div>
{:else if data.groups.length === 0}
	<p class="muted">Ничего не найдено.</p>
{:else}
	<SearchResults groups={data.groups} />
{/if}

<style>
	.search {
		margin: 0.5rem 0 1rem;
	}
	.search input {
		font-size: 1.2rem;
		padding: 0.8rem 1rem;
	}
</style>
