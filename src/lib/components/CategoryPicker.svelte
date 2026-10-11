<script lang="ts">
	import { Button, Card, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import type { CategoryRef, CategorySummary } from '$lib/domain/categories';
	import { normalizeParamKey } from '$lib/domain/params';

	/** Chooses a category: search the existing ones by name or create a new one right here. */
	let {
		onpick,
		oncancel,
		exclude = []
	}: {
		onpick: (category: CategoryRef) => void | Promise<void>;
		oncancel: () => void;
		/** Categories the type is in already. */
		exclude?: string[];
	} = $props();

	let categories = $state<CategorySummary[] | null>(null);
	let query = $state('');
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		api.get<CategorySummary[]>('/api/categories').then((list) => (categories = list));
	});

	const q = $derived(normalizeParamKey(query));
	const matches = $derived(
		(categories ?? []).filter(
			(c) => !exclude.includes(c.id) && normalizeParamKey(c.name).includes(q)
		)
	);
	const exact = $derived((categories ?? []).find((c) => normalizeParamKey(c.name) === q));

	async function run(action: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await action();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function create() {
		run(async () => onpick(await api.post<CategoryRef>('/api/categories', { name: query })));
	}
</script>

<Card class="max-w-none gap-3 p-3">
	<Input
		type="search"
		bind:value={query}
		placeholder="Найти категорию или ввести новую"
		aria-label="Категория"
		autocomplete="off"
	/>
	{#if categories === null}
		<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</p>
	{:else if matches.length > 0}
		<ul
			class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
		>
			{#each matches as category (category.id)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
						disabled={busy}
						onclick={() => run(async () => onpick(category))}
					>
						<span class="break-words">{category.name}</span>
						{#if category.params.length}
							<span class="text-sm break-words text-gray-500 dark:text-gray-400">
								{category.params.map((p) => p.name).join(', ')}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if !q}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{categories.length
				? 'Тип уже во всех категориях.'
				: 'Категорий пока нет — введите название новой.'}
		</p>
	{/if}
	{#if exact && exclude.includes(exact.id)}
		<p class="text-sm text-gray-500 dark:text-gray-400">Тип уже в категории «{exact.name}».</p>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		{#if q && !exact}
			<Button type="button" onclick={create} disabled={busy}>
				<PlusOutline class="me-1 h-4 w-4" />Новая категория «{query.trim()}»
			</Button>
		{/if}
		<Button type="button" color="alternative" onclick={oncancel} disabled={busy}>Отмена</Button>
	</div>
</Card>
