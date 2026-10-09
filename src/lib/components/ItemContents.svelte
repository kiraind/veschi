<script lang="ts">
	import { api } from '$lib/api';
	import Thumb from './Thumb.svelte';
	import ItemContents from './ItemContents.svelte';
	import type { ContentEntry } from '$lib/server/services/items';

	/** Items inside a container; nested containers expand on tap (loaded lazily). */
	let { entries }: { entries: ContentEntry[] } = $props();

	let open = $state<Record<string, ContentEntry[] | 'loading' | { error: string }>>({});

	async function toggle(id: string) {
		if (open[id]) {
			delete open[id];
			return;
		}
		open[id] = 'loading';
		try {
			open[id] = await api.get<ContentEntry[]>(`/api/items?parent=${id}`);
		} catch (e) {
			open[id] = { error: e instanceof Error ? e.message : String(e) };
		}
	}
</script>

<ul class="list">
	{#each entries as entry (entry.id)}
		{@const state = open[entry.id]}
		<li>
			<div class="entry">
				<Thumb photoKey={entry.photoKey} size={36} />
				<a class="name" href="/items/{entry.id}">{entry.name}</a>
				{#if entry.onWorkbench}<span class="badge">на столе</span>{/if}
				{#if entry.quantity > 1}<span class="badge">{entry.quantity} шт.</span>{/if}
				{#if entry.childCount > 0}
					<button
						class="expand"
						aria-expanded={Boolean(state)}
						onclick={() => toggle(entry.id)}
						title={state ? 'Свернуть' : 'Показать содержимое'}
					>
						{state ? '▾' : '▸'}
						{entry.childCount}
					</button>
				{/if}
			</div>
			{#if state === 'loading'}
				<p class="muted nested">Загрузка…</p>
			{:else if state && 'error' in state}
				<p class="error nested">{state.error}</p>
			{:else if state}
				<div class="nested"><ItemContents entries={state} /></div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.entry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.expand {
		min-height: 2.2rem;
		padding: 0.2rem 0.6rem;
	}
	.nested {
		margin: 0.4rem 0 0 1.1rem;
		padding-left: 0.6rem;
		border-left: 2px solid var(--border);
	}
</style>
