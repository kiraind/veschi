<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlusOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import AddEntrySheet from '$lib/components/AddEntrySheet.svelte';
	import Description from '$lib/components/Description.svelte';
	import EditButton from '$lib/components/EditButton.svelte';
	import HistoryLink from '$lib/components/HistoryLink.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import StepperField from '$lib/components/StepperField.svelte';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import Thumb from '$lib/components/Thumb.svelte';
	import {
		entryCountText,
		missingText,
		totalShortage,
		stockText,
		type CollectionEntryView
	} from '$lib/domain/collections';
	import { pieces } from '$lib/domain/plural';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const collection = $derived(data.card.collection);
	const entries = $derived(data.card.entries);
	const missing = $derived(totalShortage(entries));

	let renaming = $state(false);
	let describing = $state(false);
	let adding = $state(false);
	let error = $state('');

	/** The line whose quantity sheet is open. */
	let editing = $state<CollectionEntryView | null>(null);
	let editOpen = $state(false);
	let quantity = $state(1);
	let busy = $state(false);
	let editError = $state('');

	async function save(changes: { name?: string; description?: string }) {
		await api.patch(`/api/collections/${collection.id}`, changes);
		await invalidateAll();
	}

	function edit(entry: CollectionEntryView) {
		editing = entry;
		quantity = entry.quantity;
		editError = '';
		editOpen = true;
	}

	async function runEdit(action: () => Promise<unknown>) {
		busy = true;
		editError = '';
		try {
			await action();
			editOpen = false;
			await invalidateAll();
		} catch (e) {
			editError = errorText(e);
		} finally {
			busy = false;
		}
	}

	const entryUrl = (entry: CollectionEntryView) =>
		`/api/collections/${collection.id}/entries/${entry.id}`;

	async function remove() {
		const ok = await confirmAction({
			title: `Удалить коллекцию «${collection.name}»?`,
			message: entries.length ? 'Удалится только список, сами вещи останутся на местах.' : undefined
		});
		if (!ok) return;
		error = '';
		try {
			await api.delete(`/api/collections/${collection.id}`);
			await goto('/collections');
		} catch (e) {
			error = errorText(e);
		}
	}
</script>

<svelte:head><title>{collection.name} — veschi</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/collections"><ArrowLeftOutline class="h-4 w-4" />Коллекции</a
	>
</p>
<!-- Named by the text alone: the pen is not part of the heading's name. -->
<h1 class="text-2xl font-bold wrap-anywhere" aria-labelledby="page-title">
	<span id="page-title">{collection.name}</span><EditButton
		label="Изменить название"
		onclick={() => (renaming = true)}
	/>
</h1>

<div class="mt-4">
	<Description text={collection.description} onedit={() => (describing = true)} />
</div>

<h2 class="mt-6 mb-2 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold">
	{entries.length ? entryCountText(entries.length) : 'Вещи'}
	{#if missing}
		<span class="text-sm font-normal text-amber-700 dark:text-amber-400"
			>{missingText(missing)}</span
		>
	{:else if entries.length}
		<span class="text-sm font-normal text-gray-500 dark:text-gray-400">всё есть</span>
	{/if}
</h2>

<ul
	class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
>
	{#each entries as entry (entry.id)}
		{@const stock = stockText(entry)}
		<li class="flex items-center gap-3 px-3 py-2">
			<a
				href={entry.kind === 'type' ? `/types/${entry.targetId}` : `/items/${entry.targetId}`}
				class="flex-none"
				tabindex="-1"
				aria-hidden="true"
			>
				<Thumb photoKey={entry.photoKey} size={48} container={entry.isContainer} />
			</a>
			<div class="min-w-0 flex-1">
				<a
					href={entry.kind === 'type' ? `/types/${entry.targetId}` : `/items/${entry.targetId}`}
					class="font-medium wrap-anywhere text-primary-700 hover:underline dark:text-primary-400"
					>{entry.name}</a
				>
				{#if entry.stickerCode}
					<span class="ms-1 font-mono text-xs text-gray-500 dark:text-gray-400"
						>{formatCode(entry.stickerCode)}</span
					>
				{/if}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{#if entry.stock.kind === 'type'}
						<span class={stock.ok ? '' : 'text-amber-700 dark:text-amber-400'}>{stock.text}</span>
					{:else if entry.stock.archived}
						<span class="text-amber-700 dark:text-amber-400">{stock.text}</span>
					{:else}
						{#if entry.typeName}{entry.typeName} ·
						{/if}<PathTrail path={entry.stock.path} emptyText="верхний уровень" muted />
						{#if stock.text}
							· <span class={stock.ok ? '' : 'text-amber-700 dark:text-amber-400'}
								>{stock.text}</span
							>
						{/if}
					{/if}
				</p>
			</div>
			<button
				type="button"
				class="min-h-10 shrink-0 rounded-lg border border-gray-200 px-3 text-sm font-medium whitespace-nowrap text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
				aria-label="Нужно {pieces(entry.quantity)}. Изменить"
				onclick={() => edit(entry)}>{pieces(entry.quantity)}</button
			>
		</li>
	{:else}
		<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Пока пусто.</li>
	{/each}
</ul>
<div class="mt-3">
	<Button color="alternative" size="sm" class="h-10" onclick={() => (adding = true)}>
		<PlusOutline class="me-1 h-4 w-4" />Добавить
	</Button>
</div>

{#if error}<p class="mt-3 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<div class="mt-8">
	<Button color="red" outline onclick={remove}>Удалить коллекцию</Button>
</div>

<AddEntrySheet
	bind:open={adding}
	collection={{ id: collection.id, name: collection.name }}
	existing={entries}
/>

<Sheet bind:open={editOpen} title={editing ? `Количество: ${editing.name}` : ''}>
	{#if editing}
		{@const entry = editing}
		<div class="flex flex-col gap-4">
			<StepperField label="Сколько нужно" bind:value={quantity} disabled={busy} />
			{#if editError}<p class="text-sm text-red-600 dark:text-red-500" role="alert">
					{editError}
				</p>{/if}
			<div class="flex flex-wrap gap-2">
				<Button
					class="h-11"
					disabled={busy ||
						!Number.isInteger(quantity) ||
						quantity < 1 ||
						quantity === entry.quantity}
					onclick={() => runEdit(() => api.patch(entryUrl(entry), { quantity }))}>Сохранить</Button
				>
				<Button
					color="alternative"
					class="h-11"
					disabled={busy}
					onclick={() => runEdit(() => api.delete(entryUrl(entry)))}
				>
					<TrashBinOutline class="me-1.5 h-5 w-5" />Убрать из коллекции
				</Button>
			</div>
		</div>
	{/if}
</Sheet>

<TextEditSheet
	bind:open={renaming}
	title="Название коллекции"
	label="Название"
	value={collection.name}
	required
	onsave={(name) => save({ name })}
/>
<TextEditSheet
	bind:open={describing}
	title="Описание: {collection.name}"
	label="Описание"
	value={collection.description ?? ''}
	multiline
	placeholder="Для чего этот набор"
	onsave={(description) => save({ description })}
/>

<div class="mt-6"><HistoryLink id={collection.id} /></div>
