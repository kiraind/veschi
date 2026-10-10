<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Input } from 'flowbite-svelte';
	import { PlusOutline, QrCodeOutline, SearchOutline } from 'flowbite-svelte-icons';
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

<form class="mt-2 mb-4" role="search" onsubmit={(e) => e.preventDefault()}>
	<Input
		type="search"
		size="lg"
		class="ps-10 text-base"
		bind:value={query}
		placeholder="Что ищем? Например, NE555 или «корпус: DIP-8»"
		aria-label="Поиск"
		autocomplete="off"
	>
		{#snippet left()}<SearchOutline class="h-5 w-5" />{/snippet}
	</Input>
</form>

{#if !data.q.trim()}
	<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
		Ищите по названию вещи или типа и по параметрам. Чтобы искать по конкретному параметру, пишите
		«ключ: значение».
	</p>
	<div class="flex flex-wrap gap-2">
		<Button href="/scan"><QrCodeOutline class="me-2 h-5 w-5" />Сканировать</Button>
		<Button href="/items/new" color="alternative"
			><PlusOutline class="me-2 h-5 w-5" />Новая вещь</Button
		>
	</div>
{:else if data.groups.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Ничего не найдено.</p>
{:else}
	<SearchResults groups={data.groups} />
{/if}
