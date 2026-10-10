<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import ParamDefPicker from '$lib/components/ParamDefPicker.svelte';
	import { paramKindLabel, type ParamDefView } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let addingParam = $state(false);
	let filter = $state('');
	const shown = $derived(
		data.defs.filter((d) =>
			d.name.toLocaleLowerCase('ru').includes(filter.trim().toLocaleLowerCase('ru'))
		)
	);

	function usage(d: ParamDefView): string {
		const parts = [];
		if (d.typeCount) parts.push(`типов: ${d.typeCount}`);
		if (d.itemCount) parts.push(`вещей: ${d.itemCount}`);
		return parts.length ? parts.join(', ') : 'нигде не задан';
	}
</script>

<svelte:head><title>Параметры — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Параметры</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Параметры, которые можно задать типам и вещам: «Корпус», «Напряжение», «Состояние», «Гарантия до».
	У числового параметра есть единица измерения, у параметра с выбором — список вариантов. Значения
	задаются на странице типа или вещи.
</p>

{#if data.defs.length > 8}
	<Input
		class="mb-3"
		type="search"
		bind:value={filter}
		placeholder="Найти параметр"
		aria-label="Найти параметр"
	/>
{/if}

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
					<Badge color="gray" class="dark:bg-gray-700 dark:text-gray-200">{paramKindLabel(d)}</Badge
					>
					{usage(d)}
				</span>
				{#if d.valueType === 'ENUM'}
					<span class="w-full text-sm break-words text-gray-500 dark:text-gray-400">
						{d.options.map((o) => o.label).join(' / ') || 'нет вариантов'}
					</span>
				{/if}
			</a>
		</li>
	{:else}
		<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
			{data.defs.length ? 'Ничего не найдено.' : 'Параметров пока нет.'}
		</li>
	{/each}
</ul>

<div class="mt-3">
	{#if addingParam}
		<ParamDefPicker
			exclude={data.defs.map((d) => d.id)}
			onpick={(def) => goto(`/params/${def.id}`)}
			oncancel={() => (addingParam = false)}
		/>
	{:else}
		<Button color="alternative" onclick={() => (addingParam = true)}>
			<PlusOutline class="me-1 h-4 w-4" />Новый параметр
		</Button>
	{/if}
</div>
