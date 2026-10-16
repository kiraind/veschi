<script lang="ts">
	import { PlusOutline } from 'flowbite-svelte-icons';
	import ItemContents from '$lib/components/ItemContents.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const containers = $derived(data.items.filter((i) => i.isContainer));
	const loose = $derived(data.items.filter((i) => !i.isContainer));
</script>

<svelte:head><title>Вещи — veschi</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Вещи</h1>
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

<!-- Space for the button below, so it never covers the last row. -->
<div class="h-16" aria-hidden="true"></div>

<!-- Floating button: above the tab bar on phones, in the corner on wide screens. -->
<a
	href="/items/new?container=1"
	class="fixed end-4 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+1rem)] z-20 flex h-14 items-center gap-2 rounded-full bg-primary-700 ps-4 pe-5 font-medium text-white shadow-lg transition-colors hover:bg-primary-800 focus-visible:ring-4 focus-visible:ring-primary-300 focus-visible:outline-none md:end-6 md:bottom-6 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus-visible:ring-primary-800"
>
	<PlusOutline class="h-6 w-6" />
	Новый контейнер
</a>
