<script lang="ts">
	import HistoryLink from '$lib/components/HistoryLink.svelte';
	import { pieces } from '$lib/domain/plural';
	import { goto, invalidateAll } from '$app/navigation';
	import { Badge, Button, Checkbox, Helper } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import ParamSection from '$lib/components/ParamSection.svelte';
	import Description from '$lib/components/Description.svelte';
	import EditButton from '$lib/components/EditButton.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import TypeCategories from '$lib/components/TypeCategories.svelte';
	import TypeBarcode from '$lib/components/TypeBarcode.svelte';
	import BarcodeIcon from '$lib/components/BarcodeIcon.svelte';
	import InCollections from '$lib/components/InCollections.svelte';
	import type { PageData } from './$types';
	import { confirmAction } from '$lib/confirm.svelte';

	let { data }: { data: PageData } = $props();

	const type = $derived(data.card.type);
	const total = $derived(data.card.items.reduce((sum, i) => sum + i.quantity, 0));
	let error = $state('');
	let renaming = $state(false);
	let describing = $state(false);
	let barcodeOpen = $state(false);
	let containerBusy = $state(false);
	let containerError = $state('');

	async function save(changes: { name?: string; description?: string; isContainer?: boolean }) {
		await api.patch(`/api/types/${type.id}`, changes);
		await invalidateAll();
	}

	/** The checkbox saves at once; a refused change (contents, quantities) puts it back. */
	async function setContainer(event: Event & { currentTarget: HTMLInputElement }) {
		// currentTarget is null once the handler awaits: keep the element itself.
		const checkbox = event.currentTarget;
		const checked = checkbox.checked;
		containerBusy = true;
		containerError = '';
		try {
			await save({ isContainer: checked });
		} catch (e) {
			checkbox.checked = !checked;
			containerError = errorText(e);
		} finally {
			containerBusy = false;
		}
	}

	async function remove() {
		if (!(await confirmAction({ title: `Удалить тип «${type.name}»?` }))) return;
		error = '';
		try {
			await api.delete(`/api/types/${type.id}`);
			await goto('/types');
		} catch (e) {
			error = errorText(e);
		}
	}
</script>

<svelte:head><title>{type.name} — Вещи</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/types"><ArrowLeftOutline class="h-4 w-4" />Типы вещей</a
	>
</p>
<!-- Named by the text alone: the pen is not part of the heading's name. -->
<h1 class="text-2xl font-bold wrap-anywhere" aria-labelledby="page-title">
	<span id="page-title">{type.name}</span><EditButton
		label="Изменить название"
		onclick={() => (renaming = true)}
	/>
</h1>
<TypeBarcode typeId={type.id} barcode={type.barcode} bind:open={barcodeOpen} />
{#if type.isContainer}<div class="mt-1"><Badge color="indigo">контейнер</Badge></div>{/if}

<div class="mt-3">
	<PhotoField
		photoKey={type.photoKey}
		container={type.isContainer}
		alt="Фото типа «{type.name}»"
		onfile={async (file) => {
			const body = new FormData();
			body.set('file', file);
			await api.put(`/api/types/${type.id}/photo`, body);
			await invalidateAll();
		}}
		onremove={async () => {
			await api.delete(`/api/types/${type.id}/photo`);
			await invalidateAll();
		}}
	>
		{#snippet corner()}<BarcodeIcon
				barcode={type.barcode}
				onclick={() => (barcodeOpen = true)}
			/>{/snippet}
	</PhotoField>
</div>

<!-- Same shape as the action buttons on an item card. -->
<Button
	color="alternative"
	href="/items/new?type={type.id}"
	class="my-3 h-16 w-full flex-col gap-1 sm:h-11 sm:w-auto sm:flex-row sm:gap-0"
>
	<PlusOutline class="h-6 w-6 flex-none sm:me-1.5 sm:h-5 sm:w-5" />Вещь этого типа
</Button>

<div class="mt-6">
	<Description text={type.description} onedit={() => (describing = true)} />
</div>

<div class="mt-6">
	<Checkbox checked={type.isContainer} disabled={containerBusy} onchange={setContainer}
		>Контейнер</Checkbox
	>
	<Helper class="mt-1 ps-6">
		В вещи этого типа можно класть другие вещи.
		{#if type.isContainer && data.card.hasContents}Снять отметку можно, когда в контейнере пусто.{/if}
	</Helper>
	{#if containerError}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
			{containerError}
		</p>{/if}
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">Категории</h2>
<TypeCategories
	typeId={type.id}
	categories={data.card.categories}
	itemRequired={data.card.itemRequired}
/>

<h2 class="mt-6 mb-2 text-lg font-semibold">В коллекциях</h2>
<InCollections target={{ typeId: type.id }} collections={data.collections} />

<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
<ParamSection
	params={data.card.params}
	target={{ kind: 'type', id: type.id }}
	required={data.card.typeRequired}
	missing={data.card.missing}
/>

{#if data.card.items.length === 0}
	<p class="mt-6 mb-3 text-sm text-gray-500 dark:text-gray-400">Вещей этого типа нет.</p>
	<Button color="red" outline onclick={remove}>Удалить тип</Button>
{:else}
	<h2 class="mt-6 mb-2 text-lg font-semibold">
		Всего {pieces(total)}
	</h2>
	<ul class="flex flex-col gap-3">
		{#each data.card.items as item (item.id)}
			<li class="min-w-0">
				<a
					href="/items/{item.id}"
					class="font-semibold wrap-anywhere text-primary-700 hover:underline dark:text-primary-500"
					>{item.name}</a
				>
				{#if item.quantity > 1}<Badge color="gray" class="dark:bg-gray-700 dark:text-gray-200 ms-1"
						>{pieces(item.quantity)}</Badge
					>{/if}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					<PathTrail path={item.path} emptyText="верхний уровень" muted />
				</p>
			</li>
		{/each}
	</ul>
{/if}
{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<TextEditSheet
	bind:open={renaming}
	title="Название типа"
	label="Название"
	value={type.name}
	required
	onsave={(name) => save({ name })}
/>
<TextEditSheet
	bind:open={describing}
	title="Описание: {type.name}"
	label="Описание"
	value={type.description ?? ''}
	multiline
	placeholder="Что это, для чего, чем отличается — поиск находит и по описанию"
	onsave={(description) => save({ description })}
/>

<div class="mt-6"><HistoryLink id={type.id} /></div>
