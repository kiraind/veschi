<script lang="ts">
	import { Input } from 'flowbite-svelte';
	import { CloseOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import type { LinkKind, LinkTarget } from '$lib/domain/params';
	import type { SearchGroup } from '$lib/server/services/search';
	import type { TypeSummary } from '$lib/server/services/types';

	/**
	 * Targets of a link value: the chosen items (or types) with a cross each,
	 * and a search field to add more. Items are found like on «Поиск» (with
	 * where they lie), types by name.
	 */
	let { value = $bindable([]), kind }: { value?: LinkTarget[]; kind: LinkKind } = $props();

	interface Found {
		id: string;
		name: string;
		/** Where an item lies. */
		hint: string;
	}

	let query = $state('');
	let found = $state<Found[]>([]);
	let error = $state('');
	let request = 0;

	$effect(() => {
		const q = query.trim();
		if (!q) {
			found = [];
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			try {
				const list = kind === 'ITEM' ? await findItems(q) : await findTypes(q);
				if (id !== request) return;
				found = list.slice(0, 12);
				error = '';
			} catch (e) {
				if (id !== request) return;
				found = [];
				error = errorText(e);
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	async function findItems(q: string): Promise<Found[]> {
		const groups = await api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`);
		return groups.flatMap((g) =>
			g.locations.map((l) => ({
				id: l.itemId,
				name: l.name,
				hint: formatPath(l.path) || 'верхний уровень'
			}))
		);
	}

	async function findTypes(q: string): Promise<Found[]> {
		const types = await api.get<TypeSummary[]>(`/api/types?q=${encodeURIComponent(q)}`);
		return types.map((t) => ({ id: t.id, name: t.name, hint: '' }));
	}

	const chosen = $derived(new Set(value.map((v) => v.id)));

	function pick(f: Found) {
		value = [...value, { id: f.id, name: f.name, archived: false }];
		query = '';
	}

	function remove(id: string) {
		value = value.filter((v) => v.id !== id);
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if value.length}
		<ul class="flex flex-col gap-1">
			{#each value as target (target.id)}
				<li class="flex items-center gap-2">
					<span class="min-w-0 flex-1 break-words"
						>{target.name}{#if target.archived}<span
								class="ms-1 text-sm text-gray-500 dark:text-gray-400">(в архиве)</span
							>{/if}</span
					>
					<button
						type="button"
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
						title="Убрать"
						aria-label="Убрать «{target.name}»"
						onclick={() => remove(target.id)}><CloseOutline class="h-4 w-4" /></button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<Input
		type="search"
		bind:value={query}
		placeholder={kind === 'ITEM'
			? value.length
				? 'Добавить ещё вещь'
				: 'Найти вещь'
			: value.length
				? 'Добавить ещё тип'
				: 'Найти тип'}
		onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && e.preventDefault()}
	/>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	{#each found.filter((f) => !chosen.has(f.id)) as f (f.id)}
		<button
			type="button"
			class="flex min-h-10 flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-2 text-left text-sm break-words hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700"
			onclick={() => pick(f)}
		>
			{f.name}
			{#if f.hint}<span class="text-gray-500 dark:text-gray-400">{f.hint}</span>{/if}
		</button>
	{/each}
</div>
