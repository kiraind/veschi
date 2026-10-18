<script lang="ts">
	import { Button, Helper } from 'flowbite-svelte';
	import { PlusOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { inCategories } from '$lib/domain/categories';
	import { addedEntry, type ParamEntry } from '$lib/domain/param-entries';
	import type { LinkKind } from '$lib/domain/params';
	import ParamDefPicker from './ParamDefPicker.svelte';
	import ParamValueInput from './ParamValueInput.svelte';
	import RequiredMark from './RequiredMark.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * Parameter values of a type or an item that does not exist yet («Новая
	 * вещь»): each value is typed right in the form; «Параметр» picks (or
	 * creates) one more in a sheet, as ParamSection does on a card. Values the
	 * categories require cannot be removed; with `mandatory` they get the red star.
	 */
	let {
		entries = $bindable(),
		holder,
		mandatory,
		holderName
	}: {
		entries: ParamEntry[];
		/** The values go to a type (TYPE) or an item (ITEM). */
		holder: LinkKind;
		/** Required values must be filled now (on each item), not later (on the type). */
		mandatory: boolean;
		/** Name of the type or the item to be (`{name}` in file name templates). */
		holderName: string;
	} = $props();

	let picking = $state(false);
</script>

<div class="flex flex-col gap-4">
	{#each entries as entry (entry.def.id)}
		<div class="space-y-1">
			<div class="flex min-h-10 items-center justify-between gap-2">
				<span class="text-sm font-medium [overflow-wrap:anywhere]"
					>{entry.def.name}{#if mandatory && entry.categories.length > 0}<RequiredMark />{/if}</span
				>
				{#if entry.categories.length === 0}
					<button
						type="button"
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
						onclick={() => (entries = entries.filter((e) => e !== entry))}
						title="Убрать"
						aria-label="Убрать «{entry.def.name}»"><TrashBinOutline class="h-5 w-5" /></button
					>
				{/if}
			</div>
			<ParamValueInput bind:draft={entry.draft} def={entry.def} {holderName} />
			{#if entry.categories.length > 0}
				<Helper>Обязателен {inCategories(entry.categories)}</Helper>
			{/if}
		</div>
	{/each}
	<div>
		<Button
			type="button"
			color="alternative"
			size="sm"
			class="h-10"
			onclick={() => (picking = true)}
		>
			<PlusOutline class="me-1 h-4 w-4" />Параметр
		</Button>
	</div>
</div>

<Sheet bind:open={picking} title="Новый параметр">
	{#if picking}
		<ParamDefPicker
			bare
			{holder}
			exclude={entries.map((e) => e.def.id)}
			onpick={(def) => {
				entries = [...entries, addedEntry(def)];
				picking = false;
			}}
			oncancel={() => (picking = false)}
		/>
	{/if}
</Sheet>
