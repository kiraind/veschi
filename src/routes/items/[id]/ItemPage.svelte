<script lang="ts">
	import HistoryLink from '$lib/components/HistoryLink.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { api, errorText } from '$lib/api';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import Description from '$lib/components/Description.svelte';
	import EditButton from '$lib/components/EditButton.svelte';
	import InCollections from '$lib/components/InCollections.svelte';
	import ItemContents from '$lib/components/ItemContents.svelte';
	import ParamSection from '$lib/components/ParamSection.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import QuantityField from '$lib/components/QuantityField.svelte';
	import { quantityError } from '$lib/domain/workbench';
	import { archivedToast } from '$lib/item-toasts';
	import StickerSheet from '$lib/components/StickerSheet.svelte';
	import TakeToWorkbench from '$lib/components/TakeToWorkbench.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import QuantitySheet from '$lib/components/QuantitySheet.svelte';
	import ContainerDiscardSheet from '$lib/components/ContainerDiscardSheet.svelte';
	import ReturnSheet from '$lib/components/ReturnSheet.svelte';
	import MoveSheet from '$lib/components/MoveSheet.svelte';
	import { confirmAction } from '$lib/confirm.svelte';
	import { pieces } from '$lib/domain/plural';
	import { formatCode } from '$lib/domain/sticker-code';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import { Badge, Button, ButtonGroup, Card } from 'flowbite-svelte';
	import Notice from '$lib/components/Notice.svelte';
	import MissingParamsNotice from '$lib/components/MissingParamsNotice.svelte';
	import {
		ChevronSortOutline,
		CloseOutline,
		PrinterOutline,
		ArrowDownToBracketOutline,
		ArrowsRepeatOutline,
		PlusOutline,
		QrCodeOutline,
		TrashBinOutline,
		UndoOutline
	} from 'flowbite-svelte-icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const card = $derived(data.card);
	const item = $derived(card.item);
	const active = $derived(item.status === 'ACTIVE');
	const container = $derived(item.isContainer);

	let moving = $state(false);
	let taking = $state(false);
	let returning = $state(false);
	/** How much «Вернуть» puts back. */
	let returnQuantity = $state(1);
	let adding = $state(false);
	let renaming = $state(false);
	let describing = $state(false);
	let changingQuantity = $state(false);
	let discarding = $state(false);
	let addingSticker = $state(false);

	/** The two parameter lists, so the notice at the top can open a missing value. */
	let itemParamSection = $state<ParamSection>();
	let typeParamSection = $state<ParamSection>();

	/** Why the quantity of this item is always 1, if it is. */
	const quantityLock = $derived(
		card.sticker?.status === 'BOUND'
			? 'У вещи с наклейкой количество всегда 1: наклейка обозначает одну вещь. Чтобы изменить количество, отвяжите наклейку.'
			: null
	);
	let busy = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			moving = false;
			adding = false;
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	/** The action buttons under the photo: tall, with the icon over the label on phones. */
	const actionClass =
		'h-16 flex-1 flex-col gap-1 px-2 whitespace-nowrap sm:h-11 sm:flex-none sm:flex-row sm:gap-0 sm:px-4';
	const actionIconClass = 'h-6 w-6 flex-none sm:me-1.5 sm:h-5 sm:w-5';

	/** «Положить сюда существующую»: the picked item while asking how much of it. */
	let picked = $state<{ id: string; name: string; quantity: number } | null>(null);
	let pickedQuantity = $state(1);

	function startMoving() {
		moving = true;
	}

	function startReturning() {
		returnQuantity = item.quantity;
		returning = true;
	}

	async function rename(name: string) {
		await api.patch(`/api/items/${item.id}`, { name });
		await invalidateAll();
	}

	async function describe(description: string) {
		await api.patch(`/api/types/${card.type!.id}`, { description });
		await invalidateAll();
	}

	function toggleAdding() {
		adding = !adding;
		picked = null;
	}

	/** «Положить сюда существующую»: asks how much when the picked item has more than one. */
	async function pickChild(c: { id: string; name: string }) {
		error = '';
		try {
			const fresh = await api.get<{ item: { quantity: number } }>(`/api/items/${c.id}`);
			if (fresh.item.quantity > 1) {
				picked = { ...c, quantity: fresh.item.quantity };
				pickedQuantity = fresh.item.quantity;
				return;
			}
		} catch (e) {
			error = errorText(e);
			return;
		}
		await moveHere(c.id);
	}

	/** Moves the picked item (or `quantity` of it) into this container. */
	const moveHere = (childId: string, quantity?: number) =>
		run(async () => {
			await api.post(`/api/items/${childId}/move`, { parentId: item.id, quantity });
			picked = null;
		});

	const cancelStickerOrder = () => run(() => api.delete(`/api/stickers/orders/${item.id}`));

	const restore = () => run(() => api.post(`/api/items/${item.id}/restore`));

	/** «Выкинуть» of a container: what to do with the contents is asked only when there are some. */
	async function discardContainer() {
		if (card.children.length > 0) {
			discarding = true;
			return;
		}
		const ok = await confirmAction({
			title: `Выкинуть «${item.displayName}»?`,
			message: 'Контейнер уйдёт в архив, оттуда его можно вернуть.',
			confirmLabel: 'Выкинуть'
		});
		if (!ok) return;
		busy = true;
		error = '';
		// The page shows another item after afterArchive.
		const { id, displayName } = item;
		try {
			await api.post(`/api/items/${id}/discard`, { contents: 'parent' });
			await afterArchive();
			archivedToast(`Выкинули «${displayName}»`, id);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	/** After «Использовать / Выкинуть» of the whole item: go to its container or workbench. */
	async function afterArchive() {
		const parent = card.path.at(-1);
		await goto(!parent ? '/containers' : parent.isWorkbench ? '/workbench' : `/items/${parent.id}`);
	}
</script>

<svelte:head><title>{item.displayName} — veschi</title></svelte:head>

{#if !active}
	<Notice tone="danger" class="mb-4">
		<p class="font-semibold">В архиве</p>
		<p class="mb-2">Вещь выкинута или использована. Её можно вернуть в каталог.</p>
		<Button size="sm" class="h-10" onclick={restore} disabled={busy}>Восстановить</Button>
	</Notice>
{/if}

<p class="text-sm text-gray-500 dark:text-gray-400">
	<!-- An archived item lies nowhere: its path is where it was. -->
	{#if !active}<span>Лежала:</span>{/if}<PathTrail
		path={card.path}
		emptyText={active ? 'Верхний уровень' : 'верхний уровень'}
	/>
</p>

<div class="mt-1 mb-3">
	<!-- Named by the text alone: the pen is not part of the heading's name. -->
	<h1 class="text-2xl font-bold wrap-anywhere" aria-labelledby="page-title">
		<span id="page-title">{item.displayName}</span>{#if active && !item.isWorkbench}<EditButton
				label="Изменить название"
				onclick={() => (renaming = true)}
			/>{/if}
	</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2">
		{#if card.type}
			<a href="/types/{card.type.id}">{card.type.name}</a>
		{:else if item.isWorkbench}
			<span class="text-sm text-gray-500 dark:text-gray-400">Рабочий стол</span>
		{/if}
		{#if card.type?.isContainer}<Badge color="indigo">контейнер</Badge>{/if}
		{#each card.categories as category (category.id)}
			<a href="/categories/{category.id}"><Badge color="primary">{category.name}</Badge></a>
		{/each}
		{#if item.quantity > 1 && !(active && !item.isWorkbench)}<Badge
				color="gray"
				class="dark:bg-gray-700 dark:text-gray-200">{pieces(item.quantity)}</Badge
			>{/if}
		{#if item.takenById && active}<Badge color="yellow">на столе</Badge>{/if}
	</div>
</div>

{#if active && !item.isWorkbench}
	<MissingParamsNotice
		missing={[...card.missingItemParams, ...card.missingTypeParams]}
		onfill={(r) =>
			(card.missingItemParams.includes(r) ? itemParamSection : typeParamSection)?.fill(r)}
	/>
{/if}

<!-- «Фото не нужно» with nothing to press (an archived item): no strip at all. -->
{#if card.type && !(card.type.noPhoto && !card.type.photoKey && !active)}
	{@const type = card.type}
	<PhotoField
		photoKey={type.photoKey}
		container={type.isContainer}
		alt="Фото типа «{type.name}»"
		editable={active}
		noPhoto={type.noPhoto}
		onnophoto={async (noPhoto) => {
			await api.patch(`/api/types/${type.id}`, { noPhoto });
			await invalidateAll();
		}}
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
	/>
{/if}

<!-- Actions and the sticker: one column, 12 px apart; sections below start 24 px lower. -->
<div class="mt-3 flex flex-col gap-3">
	{#if active && !item.isWorkbench}
		<ButtonGroup class="w-full sm:w-auto sm:self-start">
			{#if data.onBench?.isNew}
				<!-- Created right on a workbench: no place to go back to, so it is put somewhere. -->
				<Button color="alternative" class={actionClass} onclick={startMoving}>
					<ArrowDownToBracketOutline class={actionIconClass} />
					Положить
				</Button>
			{:else if data.onBench}
				<!-- On a workbench: the button puts it back, as «Вернуть» on the workbench page. -->
				<Button color="alternative" class={actionClass} onclick={startReturning}>
					<UndoOutline class={actionIconClass} />
					Вернуть
				</Button>
			{:else}
				<Button color="alternative" class={actionClass} onclick={() => (taking = true)}>
					<WorkbenchIcon icon={null} class={actionIconClass} />
					На стол
				</Button>
			{/if}
			{#if !data.onBench?.isNew}
				<Button color="alternative" class={actionClass} onclick={startMoving}>
					<ArrowsRepeatOutline class={actionIconClass} />
					Переложить
				</Button>
			{/if}
			{#if container}
				<!-- A container is always one: throwing it away is the only thing to do here. -->
				<Button color="alternative" class={actionClass} onclick={discardContainer} disabled={busy}>
					<TrashBinOutline class={actionIconClass} />
					Выкинуть
				</Button>
			{:else}
				<!-- Shows the quantity; opens the sheet that changes it, uses or discards the item. -->
				{@const quantityText = pieces(item.quantity)}
				<Button
					color="alternative"
					class={actionClass}
					aria-label="Количество: {quantityText}. Изменить"
					onclick={() => (changingQuantity = true)}
				>
					<ChevronSortOutline class={actionIconClass} />
					{quantityText}
				</Button>
			{/if}
		</ButtonGroup>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">
			{error}
		</p>{/if}
	{#if !item.isWorkbench}
		{#if card.sticker?.status === 'BOUND'}
			{@const code = formatCode(card.sticker.code)}
			{#if active}
				<!-- Opens StickerSheet: what to do with the bound sticker. -->
				<Button
					color="alternative"
					class="h-11 w-full"
					aria-label="Наклейка {code}"
					onclick={() => (addingSticker = true)}
				>
					<QrCodeOutline class="me-1.5 h-5 w-5" />Наклейка
					<span class="ms-1.5 font-mono font-semibold">{code}</span>
				</Button>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Наклейка <span class="font-mono font-semibold">{code}</span>
				</p>
			{/if}
		{:else if card.stickerOrder !== null}
			{#if active}
				<ButtonGroup class="w-full">
					<Button color="alternative" class="h-11 flex-1" onclick={() => (addingSticker = true)}>
						<PrinterOutline class="me-1.5 h-5 w-5" />Наклейка {card.stickerOrder} мм ждёт печати
					</Button>
					<Button
						color="alternative"
						class="h-11 w-12 shrink-0 p-0"
						aria-label="Не печатать"
						title="Не печатать"
						disabled={busy}
						onclick={cancelStickerOrder}
					>
						<CloseOutline class="h-5 w-5" />
					</Button>
				</ButtonGroup>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Наклейка {card.stickerOrder} мм ждёт печати
				</p>
			{/if}
		{:else if active}
			<Button color="alternative" class="h-11 w-full" onclick={() => (addingSticker = true)}>
				<PlusOutline class="me-1.5 h-5 w-5" />Наклейка
			</Button>
		{/if}
	{/if}
</div>

{#if container}
	<!-- What a container is scanned for (FR-8): right under the actions, before the details. -->
	<h2 class="mt-6 mb-2 text-lg font-semibold">Содержимое</h2>
	{#if card.children.length > 0}
		<ItemContents entries={card.children} />
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">Пусто.</p>
	{/if}
	{#if active}
		<div class="my-3 flex flex-wrap gap-2">
			<Button color="alternative" href="/items/new?parent={item.id}">
				<PlusOutline class="me-1.5 h-5 w-5" />
				Новая вещь сюда
			</Button>
			<Button color="alternative" onclick={toggleAdding}>
				{adding ? 'Отмена' : 'Положить сюда существующую'}
			</Button>
		</div>
		{#if adding && picked}
			{@const child = picked}
			<Card class="max-w-none gap-3 p-4">
				<p class="text-lg wrap-anywhere">{child.name} → {item.displayName}</p>
				<QuantityField
					available={child.quantity}
					bind:value={pickedQuantity}
					label="Сколько положить"
				/>
				<div class="flex flex-wrap gap-2">
					<Button
						onclick={() =>
							moveHere(child.id, pickedQuantity < child.quantity ? pickedQuantity : undefined)}
						disabled={busy || !!quantityError(child.quantity, pickedQuantity)}
					>
						Положить
					</Button>
					<Button color="alternative" onclick={() => (picked = null)} disabled={busy}>
						Другая вещь
					</Button>
				</div>
			</Card>
		{:else if adding}
			<ContainerPicker
				title="Что положить в «{item.displayName}»? Найдите вещь или отсканируйте её наклейку"
				excludeId={item.id}
				excludeParentId={item.id}
				containersOnly={false}
				onpick={pickChild}
			/>
		{/if}
	{/if}
{/if}

{#if !item.isWorkbench}
	{#if card.type && (card.type.description || active)}
		<div class="mt-6">
			<!-- Under the contents a bare description would read as part of them. -->
			{#if container}<h2 class="mb-2 text-lg font-semibold">Описание</h2>{/if}
			<Description
				text={card.type.description}
				onedit={active ? () => (describing = true) : undefined}
			/>
		</div>
	{/if}

	<h2 class="mt-6 mb-2 text-lg font-semibold">Индивидуальные параметры</h2>
	<ParamSection
		bind:this={itemParamSection}
		params={card.itemParams}
		target={{ kind: 'item', id: item.id }}
		holderName={item.displayName}
		editable={active}
		emptyText=""
		required={card.itemRequired}
		missing={active ? card.missingItemParams : []}
	/>

	{#if card.type}
		<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
		<ParamSection
			bind:this={typeParamSection}
			params={card.typeParams}
			target={{ kind: 'type', id: card.type.id }}
			holderName={card.type.name}
			editable={active}
			exclude={card.itemParams.map((p) => p.defId)}
			required={card.typeRequired}
			missing={active ? card.missingTypeParams : []}
		/>
	{/if}

	{#if active || data.collections.length}
		<h2 class="mt-6 mb-2 text-lg font-semibold">В коллекциях</h2>
		<InCollections
			target={{ itemId: item.id }}
			collections={data.collections}
			editable={active}
			showQuantity={false}
		/>
	{/if}
{/if}

{#if active && !item.isWorkbench}
	<TextEditSheet
		bind:open={renaming}
		title="Название"
		label="Название этой конкретной вещи"
		value={item.name ?? ''}
		placeholder={card.type?.name ?? ''}
		helper={card.type ? `Пусто — показывается название типа «${card.type.name}».` : ''}
		onsave={rename}
	/>
	{#if card.type}
		<TextEditSheet
			bind:open={describing}
			title="Описание типа «{card.type.name}»"
			label="Описание"
			value={card.type.description ?? ''}
			multiline
			helper="Описание общее для всех вещей типа."
			placeholder="Что это, для чего, чем отличается — поиск находит и по описанию"
			onsave={describe}
		/>
	{/if}
	<QuantitySheet
		bind:open={changingQuantity}
		item={{
			id: item.id,
			name: item.displayName,
			quantity: item.quantity
		}}
		lock={quantityLock}
		onarchived={afterArchive}
	/>
	<ContainerDiscardSheet
		bind:open={discarding}
		item={{ id: item.id, name: item.displayName }}
		parent={card.path.at(-1) ?? null}
		inside={card.children}
		ondiscarded={afterArchive}
	/>
	<TakeToWorkbench
		item={{ id: item.id, quantity: item.quantity, name: item.displayName }}
		bind:open={taking}
	/>
	{#if data.onBench}
		<ReturnSheet
			bind:open={returning}
			item={data.onBench}
			bind:amount={returnQuantity}
			askAmount
			onreturned={invalidateAll}
			onrelocate={startMoving}
		/>
	{/if}
	<StickerSheet
		bind:open={addingSticker}
		itemId={item.id}
		quantity={item.quantity}
		ordered={card.stickerOrder}
		caption={card.stickerCaption}
		name={item.displayName}
		bound={card.sticker?.status === 'BOUND' ? card.sticker.code : null}
	/>
	<MoveSheet
		bind:open={moving}
		title="{data.onBench?.isNew ? 'Положить' : 'Переложить'} «{item.displayName}»"
		item={{
			id: item.id,
			quantity: item.quantity,
			parentId: item.parentId,
			onBench: !!item.takenById
		}}
		onmoved={invalidateAll}
	/>
{/if}

<div class="mt-6"><HistoryLink id={item.id} /></div>
