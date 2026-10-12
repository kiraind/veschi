<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { CloseOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import type { CollectionRef } from '$lib/domain/collections';
	import { pieces } from '$lib/domain/plural';
	import { confirmAction } from '$lib/confirm.svelte';
	import type { EntryOf } from '$lib/server/services/collections';
	import CollectionPicker from './CollectionPicker.svelte';

	/**
	 * Collections a type or an item is in, on its card: a chip per collection
	 * (link, with the quantity unless `showQuantity` is off; cross to take it out) and «Коллекция» to add it
	 * to one more (one piece; the quantity is changed on the collection page).
	 */
	let {
		target,
		collections,
		editable = true,
		showQuantity = true
	}: {
		target: { typeId: string } | { itemId: string };
		collections: EntryOf[];
		editable?: boolean;
		/** «· 2 штуки» after the name; an item's card leaves it out. */
		showQuantity?: boolean;
	} = $props();

	let picking = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>) {
		error = '';
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		}
	}

	async function add(collection: CollectionRef) {
		await api.post(`/api/collections/${collection.id}/entries`, { ...target, quantity: 1 });
		picking = false;
		await invalidateAll();
	}

	async function remove(entry: EntryOf) {
		const ok = await confirmAction({
			title: `Убрать из коллекции «${entry.name}»?`,
			confirmLabel: 'Убрать'
		});
		if (ok) run(() => api.delete(`/api/collections/${entry.id}/entries/${entry.entryId}`));
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#each collections as entry (entry.id)}
		<span
			class="inline-flex h-10 items-center rounded-lg bg-gray-100 ps-3 text-sm font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-100"
		>
			<a href="/collections/{entry.id}" class="hover:underline"
				>{entry.name}{#if showQuantity}<span class="font-normal text-gray-500 dark:text-gray-400"
						>{` · ${pieces(entry.quantity)}`}</span
					>{/if}</a
			>
			{#if editable}
				<button
					type="button"
					class="flex h-10 w-9 items-center justify-center rounded-e-lg hover:bg-gray-200 dark:hover:bg-gray-600"
					title="Убрать из коллекции"
					aria-label="Убрать из коллекции «{entry.name}»"
					onclick={() => remove(entry)}><CloseOutline class="h-4 w-4" /></button
				>
			{:else}
				<span class="w-3"></span>
			{/if}
		</span>
	{/each}
	{#if editable && !picking}
		<Button color="alternative" size="sm" class="h-10" onclick={() => (picking = true)}>
			<PlusOutline class="me-1 h-4 w-4" />Коллекция
		</Button>
	{/if}
</div>
{#if picking}
	<div class="mt-2">
		<CollectionPicker
			onpick={add}
			oncancel={() => (picking = false)}
			exclude={collections.map((c) => c.id)}
		/>
	</div>
{/if}
{#if error}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
