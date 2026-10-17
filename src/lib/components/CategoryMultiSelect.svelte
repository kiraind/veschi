<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import type { CategoryRef, CategorySummary } from '$lib/domain/categories';
	import { normalizeParamKey } from '$lib/domain/params';
	import { searchKey } from '$lib/domain/search';

	/**
	 * Picks several categories: a search field over the existing ones, toggle
	 * chips (chosen ones first) and «Новая категория «…»» for a name nothing
	 * matches. Enter in the field picks the first match or creates the new one.
	 */
	let { selected = $bindable([]) }: { selected?: string[] } = $props();

	/** Most chips shown while nothing is typed (chosen ones are always shown). */
	const MAX_SHOWN = 12;

	let categories = $state<CategorySummary[] | null>(null);
	let query = $state('');
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		api.get<CategorySummary[]>('/api/categories').then((list) => (categories = list));
	});

	const q = $derived(normalizeParamKey(query));
	const needle = $derived(searchKey(query));
	const exact = $derived((categories ?? []).find((c) => normalizeParamKey(c.name) === q));
	const shown = $derived.by(() => {
		const all = categories ?? [];
		const chosen = all.filter((c) => selected.includes(c.id));
		const rest = all.filter((c) => !selected.includes(c.id) && searchKey(c.name).includes(needle));
		return [...chosen, ...(q ? rest : rest.slice(0, MAX_SHOWN))];
	});

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
	}

	async function create() {
		busy = true;
		error = '';
		try {
			const created = await api.post<CategoryRef>('/api/categories', { name: query });
			categories = [
				...(categories ?? []),
				{ ...created, description: null, params: [], typeCount: 0 }
			].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
			selected = [...selected, created.id];
			query = '';
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		// Enter must not submit the surrounding form.
		event.preventDefault();
		if (!q) return;
		const first = exact ?? shown.find((c) => !selected.includes(c.id));
		if (first) {
			if (!selected.includes(first.id)) toggle(first.id);
			query = '';
		} else if (!busy) {
			create();
		}
	}
</script>

<div class="flex flex-col gap-2">
	<Input
		type="search"
		bind:value={query}
		{onkeydown}
		placeholder="Найти категорию или ввести новую"
		aria-label="Найти категорию или ввести новую"
		autocomplete="off"
	/>
	{#if shown.length || (q && !exact)}
		<div class="flex flex-wrap gap-2" role="group" aria-label="Категории">
			{#each shown as category (category.id)}
				{@const on = selected.includes(category.id)}
				<button
					type="button"
					class="h-10 rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none {on
						? 'border-primary-700 bg-primary-700 text-white dark:border-primary-600 dark:bg-primary-600'
						: 'border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}"
					aria-pressed={on}
					onclick={() => toggle(category.id)}>{category.name}</button
				>
			{/each}
			{#if q && !exact}
				<Button type="button" color="alternative" class="h-10" onclick={create} disabled={busy}>
					<PlusOutline class="me-1 h-4 w-4" />Новая категория «{query.trim()}»
				</Button>
			{/if}
		</div>
	{:else if categories?.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Категорий пока нет — введите название новой.
		</p>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
