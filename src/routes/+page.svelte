<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Input } from 'flowbite-svelte';
	import {
		ChevronRightOutline,
		PlusOutline,
		QrCodeOutline,
		SearchOutline
	} from 'flowbite-svelte-icons';
	import { formatBarcode } from '$lib/domain/barcode';
	import SearchNotices from '$lib/components/SearchNotices.svelte';
	import SearchResults from '$lib/components/SearchResults.svelte';
	import { searchPlaceholder } from '$lib/domain/search';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Initialised from the URL once; afterwards the input drives the URL.
	// svelte-ignore state_referenced_locally
	let query = $state(data.q);
	/** The query this page last put into the URL. */
	// svelte-ignore state_referenced_locally
	let requested = data.q.trim();
	/** The server sends a placeholder only with an empty query; the last one stays while typing. */
	// svelte-ignore state_referenced_locally
	let placeholder = $state(data.placeholder ?? searchPlaceholder([], []));
	$effect(() => {
		if (data.placeholder) placeholder = data.placeholder;
	});

	// The URL changed from outside (the «Поиск» tab, back): the field follows it.
	$effect(() => {
		const q = data.q.trim();
		if (q !== requested) {
			requested = q;
			query = data.q;
		}
	});

	$effect(() => {
		const q = query.trim();
		if (q === data.q.trim()) return;
		const timer = setTimeout(() => {
			requested = q;
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

	const empty = $derived(!data.q.trim());

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

{#snippet actions(cls: string)}
	<Button href="/scan" class={cls}><QrCodeOutline class="me-2 h-5 w-5" />Сканировать</Button>
	<Button href="/items/new" color="alternative" class={cls}
		><PlusOutline class="me-2 h-5 w-5" />Новая вещь</Button
	>
{/snippet}

<!-- On phones the field is at the bottom, over the tab bar (4rem + its border), or right
     over the keyboard while it is open; the page leaves room for it. With nothing typed,
     «Сканировать» and «Новая вещь» sit right above it, within reach of the thumb. -->
<form
	class="mt-2 mb-4 max-md:fixed max-md:inset-x-0 max-md:bottom-[max(var(--keyboard),calc(4rem+1px+env(safe-area-inset-bottom)))] max-md:z-20 max-md:m-0 max-md:bg-linear-to-t max-md:from-gray-50 max-md:from-70% max-md:to-transparent max-md:px-4 max-md:pt-4 max-md:pb-3 max-md:dark:from-gray-900"
	style:--keyboard="{keyboard}px"
	role="search"
	onsubmit={(e) => e.preventDefault()}
>
	{#if empty && keyboard === 0}
		<div class="mb-3 grid grid-cols-2 gap-3 md:hidden">
			{@render actions('h-14 rounded-2xl text-base')}
		</div>
	{/if}
	<Input
		type="search"
		size="lg"
		class="ps-11 text-base max-md:h-14 max-md:rounded-2xl max-md:placeholder:text-gray-400 max-md:border-2 max-md:border-primary-600 max-md:bg-white max-md:shadow-lg max-md:dark:border-primary-500 max-md:dark:bg-gray-800"
		bind:value={query}
		{placeholder}
		aria-label="Поиск"
		autocomplete="off"
	>
		{#snippet left()}<SearchOutline
				class="h-5 w-5 max-md:text-primary-600 max-md:dark:text-primary-400"
			/>{/snippet}
	</Input>
</form>

{#if !empty && data.barcode && data.barcode.status !== 'invalid'}
	{@const known = data.barcode.status === 'known' ? data.barcode.type : null}
	<a
		href={known ? `/types/${known.id}` : `/barcode/${data.barcode.code}`}
		class="mb-4 flex min-h-14 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-xs hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
	>
		<span class="min-w-0 flex-1">
			<span class="block font-medium wrap-anywhere text-gray-900 dark:text-white"
				>{known
					? `Тип «${known.name}»`
					: `Штрихкод ${formatBarcode(data.barcode.code)} не привязан`}</span
			>
			<span class="block text-sm text-gray-500 dark:text-gray-400"
				>{known
					? 'Штрихкод этого типа. Вещей этого типа сейчас нет.'
					: 'Привязать к типу или добавить вещь'}</span
			>
		</span>
		<ChevronRightOutline class="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
	</a>
{/if}

{#if empty}
	<div class="mb-4 flex flex-wrap gap-2 max-md:hidden">{@render actions('')}</div>
	{#if data.notices}<SearchNotices notices={data.notices} />{/if}
{:else if data.groups.length === 0 && !data.barcode}
	<p class="text-sm text-gray-500 dark:text-gray-400">Ничего не найдено.</p>
{:else}
	<SearchResults groups={data.groups} />
	{#if data.truncated}
		<p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
			Показаны не все места — уточните запрос.
		</p>
	{/if}
{/if}

<div class="h-16 md:hidden" aria-hidden="true"></div>
