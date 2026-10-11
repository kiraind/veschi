<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import ItemContents from '$lib/components/ItemContents.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const containers = $derived(data.items.filter((i) => i.isContainer));
	const loose = $derived(data.items.filter((i) => !i.isContainer));
</script>

<svelte:head><title>Контейнеры</title></svelte:head>

<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
	<h1 class="text-2xl font-bold">Контейнеры</h1>
	<Button href="/items/new?container=1" size="sm" class="h-10">
		<PlusOutline class="me-1.5 h-4 w-4" />
		Новый контейнер
	</Button>
</div>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Верхний уровень: шкафы, ящики и полки, которые ни во что не положены.
</p>

{#if containers.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Пока нет ни одного контейнера.</p>
{:else}
	<ItemContents entries={containers} />
{/if}

{#if loose.length > 0}
	<h2 class="mt-6 mb-2 text-lg font-semibold">Вещи без места</h2>
	<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">Не лежат ни в одном контейнере.</p>
	<ItemContents entries={loose} />
{/if}
