<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, Card, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import ParamDefCreate from '$lib/components/ParamDefCreate.svelte';
	import {
		LINK_HOLDER_LABELS,
		normalizeParamKey,
		paramKindLabel,
		type ParamDefView
	} from '$lib/domain/params';
	import { searchKey } from '$lib/domain/search';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The field on top filters the list; a name nothing matches exactly can be created. */
	let query = $state('');
	let creating = $state(false);
	const q = $derived(normalizeParamKey(query));
	const needle = $derived(searchKey(query));
	const shown = $derived(data.defs.filter((d) => searchKey(d.name).includes(needle)));
	const exact = $derived(data.defs.some((d) => normalizeParamKey(d.name) === q));

	function usage(d: ParamDefView): string {
		const parts = [];
		if (d.typeCount) parts.push(`типов: ${d.typeCount}`);
		if (d.itemCount) parts.push(`вещей: ${d.itemCount}`);
		return parts.length ? parts.join(', ') : 'нигде не задан';
	}
</script>

<svelte:head><title>Параметры — veschi</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">Параметры</h1>

<Input
	type="search"
	bind:value={query}
	placeholder="Найти параметр или ввести новый"
	aria-label="Найти параметр или ввести новый"
	autocomplete="off"
	disabled={creating}
/>

<div class="my-3">
	{#if creating}
		<Card class="max-w-none gap-3 p-3">
			<ParamDefCreate
				name={query}
				oncreated={(def) => goto(`/params/${def.id}`)}
				oncancel={() => (creating = false)}
			/>
		</Card>
	{:else if !exact}
		<Button color="alternative" onclick={() => (creating = true)}>
			<PlusOutline class="me-1 h-4 w-4" />{q
				? `Новый параметр «${query.trim()}»`
				: 'Новый параметр'}
		</Button>
	{/if}
</div>

{#if !creating}
	<ul
		class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
	>
		{#each shown as d (d.id)}
			<li>
				<a
					href="/params/{d.id}"
					class="flex min-h-12 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
				>
					<span class="min-w-0 font-medium break-words">{d.name}</span>
					<span class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
						<Badge color="gray" class="dark:bg-gray-700 dark:text-gray-200"
							>{paramKindLabel(d)}</Badge
						>
						{usage(d)}
					</span>
					{#if d.valueType === 'ENUM'}
						<span class="w-full text-sm break-words text-gray-500 dark:text-gray-400">
							{d.options.map((o) => o.label).join(' / ') || 'нет вариантов'}
						</span>
					{:else if d.inverse && d.holder}
						<span class="w-full text-sm break-words text-gray-500 dark:text-gray-400">
							{LINK_HOLDER_LABELS[d.holder].replace(/^у/, 'У')} · {d.inverse.id === d.id
								? 'в обе стороны'
								: `у связанной: «${d.inverse.name}»`}
						</span>
					{/if}
				</a>
			</li>
		{:else}
			<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
				{data.defs.length ? 'Такого параметра нет.' : 'Параметров пока нет.'}
			</li>
		{/each}
	</ul>
{/if}
