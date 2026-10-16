<script lang="ts">
	import { pieces } from '$lib/domain/plural';
	import { Badge } from 'flowbite-svelte';
	import { ChevronDownOutline, ChevronRightOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
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
			open[id] = { error: errorText(e) };
		}
	}
</script>

<ul class="flex flex-col gap-1">
	{#each entries as entry (entry.id)}
		{@const state = open[entry.id]}
		<li>
			<div
				class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
			>
				<Thumb photoKey={entry.photoKey} size={40} container={entry.isContainer} />
				<a
					class="min-w-0 flex-1 font-medium break-words text-gray-900 hover:underline dark:text-white"
					href="/items/{entry.id}">{entry.name}</a
				>
				{#if entry.onWorkbench}<Badge color="yellow">на столе</Badge>{/if}
				{#if entry.quantity > 1}<Badge color="gray" class="dark:bg-gray-700 dark:text-gray-200"
						>{pieces(entry.quantity)}</Badge
					>{/if}
				{#if entry.childCount > 0}
					<button
						class="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
						aria-expanded={Boolean(state)}
						onclick={() => toggle(entry.id)}
						title={state ? 'Свернуть' : 'Показать содержимое'}
					>
						{#if entry.thingCount > 0}<span
								><span class="sr-only">внутри </span>{pieces(entry.thingCount)}</span
							>{/if}
						{#if state}
							<ChevronDownOutline class="h-4 w-4" />
						{:else}
							<ChevronRightOutline class="h-4 w-4" />
						{/if}
					</button>
				{/if}
			</div>
			{#if state === 'loading'}
				<p class="mt-1 ml-5 text-sm text-gray-500 dark:text-gray-400">Загрузка…</p>
			{:else if state && 'error' in state}
				<p class="mt-1 ml-5 text-sm text-red-600 dark:text-red-500">{state.error}</p>
			{:else if state}
				<div class="mt-1 ml-5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
					<ItemContents entries={state} />
				</div>
			{/if}
		</li>
	{/each}
</ul>
