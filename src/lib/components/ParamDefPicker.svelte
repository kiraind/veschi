<script lang="ts">
	import { Button, Card, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import {
		fitsHolder,
		normalizeParamKey,
		paramKindLabel,
		type LinkKind,
		type ParamDefView
	} from '$lib/domain/params';
	import ParamDefCreate from './ParamDefCreate.svelte';

	/**
	 * Chooses a parameter: search the existing ones by name or create a new one
	 * (name, value type, unit or drop-down options) right here. With `holder`
	 * only parameters a type (TYPE) or an item (ITEM) can have are offered.
	 */
	let {
		onpick,
		oncancel,
		exclude = [],
		holder,
		bare = false
	}: {
		onpick: (def: ParamDefView) => void;
		oncancel: () => void;
		/** Parameters the list already has. */
		exclude?: string[];
		/** The value goes to a type or an item: links living elsewhere are not offered. */
		holder?: LinkKind;
		/** Without the card frame (inside a sheet). */
		bare?: boolean;
	} = $props();

	let defs = $state<ParamDefView[] | null>(null);
	let query = $state('');
	let loadError = $state('');
	let creating = $state(false);

	$effect(() => {
		api
			.get<ParamDefView[]>('/api/param-defs')
			.then((list) => (defs = list))
			.catch((e) => (loadError = errorText(e)));
	});

	const q = $derived(normalizeParamKey(query));
	const matches = $derived(
		(defs ?? [])
			.filter(
				(d) =>
					!exclude.includes(d.id) &&
					(!holder || fitsHolder(d, holder)) &&
					normalizeParamKey(d.name).includes(q)
			)
			.slice(0, q ? 8 : 12)
	);
	const exact = $derived((defs ?? []).find((d) => normalizeParamKey(d.name) === q));
</script>

{#snippet body()}
	{#if !creating}
		<Input
			type="search"
			bind:value={query}
			placeholder="Найти параметр или ввести новый"
			aria-label="Параметр"
			autocomplete="off"
			onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && e.preventDefault()}
		/>
		{#if loadError}
			<p class="text-sm text-red-600 dark:text-red-500" role="alert">{loadError}</p>
		{:else if defs === null}
			<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</p>
		{:else}
			{#if matches.length > 0}
				<ul
					class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
				>
					{#each matches as def (def.id)}
						<li>
							<button
								type="button"
								class="flex min-h-11 w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
								onclick={() => onpick(def)}
							>
								<span class="break-words">{def.name}</span>
								<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400">
									{paramKindLabel(def)}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if !q}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Параметров пока нет — введите название нового.
				</p>
			{/if}
			{#if exact && exclude.includes(exact.id)}
				<p class="text-sm text-gray-500 dark:text-gray-400">«{exact.name}» уже есть в списке.</p>
			{:else if exact && holder && !fitsHolder(exact, holder)}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					«{exact.name}» — связь {exact.holder === 'TYPE' ? 'у типов' : 'у вещей'}, здесь её не
					задать.
				</p>
			{/if}
		{/if}
		<div class="flex flex-wrap gap-2">
			{#if q && !exact}
				<Button type="button" onclick={() => (creating = true)}>
					<PlusOutline class="me-1 h-4 w-4" />Новый параметр «{query.trim()}»
				</Button>
			{/if}
			<Button type="button" color="alternative" onclick={oncancel}>Отмена</Button>
		</div>
	{:else}
		<ParamDefCreate
			name={query}
			{holder}
			oncreated={onpick}
			oncancel={() => (creating = false)}
			cancelLabel="Назад"
		/>
	{/if}
{/snippet}

{#if bare}
	<div class="flex flex-col gap-3">{@render body()}</div>
{:else}
	<Card class="max-w-none gap-3 p-3">{@render body()}</Card>
{/if}
