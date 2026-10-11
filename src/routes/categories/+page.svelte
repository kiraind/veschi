<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import { PARAM_LEVEL_LABELS, type CategoryRef } from '$lib/domain/categories';
	import { normalizeParamKey } from '$lib/domain/params';
	import { plural } from '$lib/domain/plural';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The field on top filters the list; a name nothing matches exactly can be created. */
	let query = $state('');
	let busy = $state(false);
	let error = $state('');
	const q = $derived(normalizeParamKey(query));
	const shown = $derived(
		data.categories.filter((c) => normalizeParamKey(`${c.name} ${c.description ?? ''}`).includes(q))
	);
	const exact = $derived(data.categories.some((c) => normalizeParamKey(c.name) === q));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!q || exact) return;
		busy = true;
		error = '';
		try {
			const category = await api.post<CategoryRef>('/api/categories', { name: query });
			await goto(`/categories/${category.id}`);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Категории — Вещи</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">
	Категории<InfoHint title="Что такое категория">
		<p>
			Категория задаёт, какие параметры обязательно заполнить у её типов: например, у «Еды» —
			калорийность у типа и срок годности у каждой вещи.
		</p>
		<p>У типа может быть несколько категорий, их параметры складываются.</p>
	</InfoHint>
</h1>

<form class="flex gap-2" onsubmit={create}>
	<div class="min-w-0 flex-1">
		<Input
			type="search"
			bind:value={query}
			placeholder="Найти категорию или ввести новую"
			aria-label="Найти категорию или ввести новую"
			autocomplete="off"
		/>
	</div>
	<Button type="submit" class="shrink-0" disabled={busy || !q || exact}>
		<PlusOutline class="me-1 h-4 w-4" />Создать
	</Button>
</form>
{#if error}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<ul
	class="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
>
	{#each shown as c (c.id)}
		<li>
			<a
				href="/categories/{c.id}"
				class="flex min-h-12 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
			>
				<span class="min-w-0 font-medium break-words">{c.name}</span>
				<span class="text-sm text-gray-500 dark:text-gray-400">
					{c.typeCount
						? `${c.typeCount} ${plural(c.typeCount, ['тип', 'типа', 'типов'])}`
						: 'нет типов'}
				</span>
				<span class="w-full text-sm break-words text-gray-500 dark:text-gray-400">
					{c.params.length
						? c.params.map((p) => `${p.name} (${PARAM_LEVEL_LABELS[p.level]})`).join(', ')
						: 'обязательных параметров нет'}
				</span>
			</a>
		</li>
	{:else}
		<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
			{data.categories.length ? 'Такой категории нет.' : 'Категорий пока нет.'}
		</li>
	{/each}
</ul>
