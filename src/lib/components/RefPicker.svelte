<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import type { ParamDraft } from '$lib/domain/param-draft';
	import type { SearchGroup } from '$lib/server/services/search';

	type Ref = NonNullable<ParamDraft['ref']>;

	/** Picks an item or a type for a REF parameter through search. */
	let { value = $bindable(null) }: { value?: Ref | null } = $props();

	let query = $state('');
	let groups = $state<SearchGroup[]>([]);
	let error = $state('');
	let request = 0;

	$effect(() => {
		const q = query.trim();
		if (!q) {
			groups = [];
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			try {
				const found = await api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`);
				if (id !== request) return;
				groups = found.slice(0, 10);
				error = '';
			} catch (e) {
				if (id !== request) return;
				groups = [];
				error = errorText(e);
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	function pick(ref: Ref) {
		value = ref;
		query = '';
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if value}
		<div class="flex flex-wrap items-center gap-2">
			<span class="min-w-0 break-words">→ {value.name}</span>
			<span class="text-sm text-gray-500 dark:text-gray-400"
				>{value.kind === 'item' ? 'вещь' : 'тип'}</span
			>
			<Button
				color="alternative"
				size="sm"
				class="h-10"
				type="button"
				onclick={() => (value = null)}>Изменить</Button
			>
		</div>
	{:else}
		<Input
			type="search"
			bind:value={query}
			placeholder="Найти вещь или тип"
			onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && e.preventDefault()}
		/>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
		{#each groups as group (group.typeId)}
			<div class="flex flex-col gap-1">
				<button
					type="button"
					class="min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm font-medium break-words hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700"
					onclick={() => pick({ kind: 'type', id: group.typeId, name: group.typeName })}
				>
					Тип «{group.typeName}»
				</button>
				{#each group.locations as location (location.itemId)}
					<button
						type="button"
						class="ms-4 flex min-h-10 flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-2 text-left text-sm break-words hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700"
						onclick={() => pick({ kind: 'item', id: location.itemId, name: location.name })}
					>
						{location.name}
						<span class="text-gray-500 dark:text-gray-400"
							>{formatPath(location.path) || 'верхний уровень'}</span
						>
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>
