<script lang="ts">
	import { api } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import type { ParamDraft } from '$lib/domain/param-draft';
	import type { SearchGroup } from '$lib/server/services/search';

	type Ref = NonNullable<ParamDraft['ref']>;

	/** Picks an item or a type for a REF parameter through search. */
	let { value = $bindable(null) }: { value?: Ref | null } = $props();

	let query = $state('');
	let groups = $state<SearchGroup[]>([]);
	let request = 0;

	$effect(() => {
		const q = query.trim();
		if (!q) {
			groups = [];
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			const found = await api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`);
			if (id === request) groups = found.slice(0, 10);
		}, 250);
		return () => clearTimeout(timer);
	});

	function pick(ref: Ref) {
		value = ref;
		query = '';
	}
</script>

<div class="stack ref">
	{#if value}
		<div class="row">
			<span>→ {value.name}</span>
			<span class="muted">{value.kind === 'item' ? 'вещь' : 'тип'}</span>
			<button type="button" onclick={() => (value = null)}>Изменить</button>
		</div>
	{:else}
		<input type="search" bind:value={query} placeholder="Найти вещь или тип" />
		{#each groups as group (group.typeId)}
			<div class="stack options">
				<button
					type="button"
					onclick={() => pick({ kind: 'type', id: group.typeId, name: group.typeName })}
				>
					Тип «{group.typeName}»
				</button>
				{#each group.locations as location (location.itemId)}
					<button
						type="button"
						class="item"
						onclick={() => pick({ kind: 'item', id: location.itemId, name: location.name })}
					>
						{location.name}
						<span class="muted">{formatPath(location.path) || 'верхний уровень'}</span>
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.ref,
	.options {
		gap: 0.3rem;
	}
	.options button {
		justify-content: flex-start;
		text-align: left;
	}
	.item {
		margin-left: 1rem;
	}
</style>
