<script lang="ts">
	import { Button, Card, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import {
		entryCountText,
		type CollectionRef,
		type CollectionSummary
	} from '$lib/domain/collections';
	import { normalizeParamKey } from '$lib/domain/params';

	/** Chooses a collection: search the existing ones by name or create a new one right here. */
	let {
		onpick,
		oncancel,
		exclude = []
	}: {
		onpick: (collection: CollectionRef) => void | Promise<void>;
		oncancel: () => void;
		/** Collections it is in already. */
		exclude?: string[];
	} = $props();

	let collections = $state<CollectionSummary[] | null>(null);
	let query = $state('');
	let loadError = $state('');
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		api
			.get<CollectionSummary[]>('/api/collections')
			.then((list) => (collections = list))
			.catch((e) => (loadError = errorText(e)));
	});

	const q = $derived(normalizeParamKey(query));
	const matches = $derived(
		(collections ?? []).filter(
			(c) => !exclude.includes(c.id) && normalizeParamKey(c.name).includes(q)
		)
	);
	const exact = $derived((collections ?? []).find((c) => normalizeParamKey(c.name) === q));

	async function run(action: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await action();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	function create() {
		run(async () => onpick(await api.post<CollectionRef>('/api/collections', { name: query })));
	}
</script>

<Card class="max-w-none gap-3 p-3">
	<Input
		type="search"
		bind:value={query}
		placeholder="Найти коллекцию или ввести новую"
		aria-label="Коллекция"
		autocomplete="off"
		onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && e.preventDefault()}
	/>
	{#if loadError}
		<p class="text-sm text-red-600 dark:text-red-500" role="alert">{loadError}</p>
	{:else if collections === null}
		<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</p>
	{:else if matches.length > 0}
		<ul
			class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
		>
			{#each matches as collection (collection.id)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
						disabled={busy}
						onclick={() => run(async () => onpick(collection))}
					>
						<span class="min-w-0 break-words">{collection.name}</span>
						<span class="text-sm text-gray-500 dark:text-gray-400">
							{entryCountText(collection.entryCount)}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if !q}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{collections.length
				? 'Уже во всех коллекциях.'
				: 'Коллекций пока нет — введите название новой.'}
		</p>
	{/if}
	{#if exact && exclude.includes(exact.id)}
		<p class="text-sm text-gray-500 dark:text-gray-400">Уже в коллекции «{exact.name}».</p>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		{#if q && !exact}
			<Button type="button" onclick={create} disabled={busy}>
				<PlusOutline class="me-1 h-4 w-4" />Новая коллекция «{query.trim()}»
			</Button>
		{/if}
		<Button type="button" color="alternative" onclick={oncancel} disabled={busy}>Отмена</Button>
	</div>
</Card>
