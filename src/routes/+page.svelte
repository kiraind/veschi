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

	/**
	 * How much of the layout viewport the on-screen keyboard covers, px. On phones the
	 * field sits at the bottom; browsers keep fixed elements under the keyboard (iOS
	 * Safari, Chrome's default «resizes-visual»), so the field is lifted above it.
	 */
	let keyboard = $state(0);

	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => {
			keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
		};
		update();
		vv.addEventListener('resize', update);
		vv.addEventListener('scroll', update);
		return () => {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
		};
	});
</script>

<svelte:head><title>Поиск — Вещи</title></svelte:head>

<!-- On phones the field is at the bottom, over the tab bar (4rem + its border), or right
     over the keyboard while it is open; the page leaves room for it. -->
<form
	class="mt-2 mb-4 max-md:fixed max-md:inset-x-0 max-md:bottom-[max(var(--keyboard),calc(4rem+1px+env(safe-area-inset-bottom)))] max-md:z-20 max-md:m-0 max-md:border-t max-md:border-gray-200 max-md:bg-gray-50 max-md:px-4 max-md:py-2 max-md:dark:border-gray-700 max-md:dark:bg-gray-900"
	style:--keyboard="{keyboard}px"
	role="search"
	onsubmit={(e) => e.preventDefault()}
>
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

<div class="h-16 md:hidden" aria-hidden="true"></div>
