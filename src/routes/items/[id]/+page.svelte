<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import DiscardDialog from '$lib/components/DiscardDialog.svelte';
	import ItemContents from '$lib/components/ItemContents.svelte';
	import ParamSection from '$lib/components/ParamSection.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import QuantityField from '$lib/components/QuantityField.svelte';
	import { quantityError } from '$lib/domain/workbench';
	import StickerPanel from '$lib/components/StickerPanel.svelte';
	import TakeToWorkbench from '$lib/components/TakeToWorkbench.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import { Alert, Badge, Button, Card } from 'flowbite-svelte';
	import { ArrowsRepeatOutline, PenOutline, PlusOutline } from 'flowbite-svelte-icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const card = $derived(data.card);
	const item = $derived(card.item);
	const active = $derived(item.status === 'ACTIVE');
	const container = $derived(item.isContainer);

	let moving = $state(false);
	let adding = $state(false);
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
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** How much «Переложить» moves (asked only when there is more than one). */
	let moveQuantity = $state(1);
	/** «Положить сюда существующую»: the picked item while asking how much of it. */
	let picked = $state<{ id: string; name: string; quantity: number } | null>(null);
	let pickedQuantity = $state(1);

	function toggleMoving() {
		moving = !moving;
		moveQuantity = item.quantity;
	}

	function toggleAdding() {
		adding = !adding;
		picked = null;
	}

	const moveTo = (parentId: string | null) =>
		run(() =>
			api.post(`/api/items/${item.id}/move`, {
				parentId,
				...(moveQuantity < item.quantity ? { quantity: moveQuantity } : {})
			})
		);

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
			error = e instanceof ApiError ? e.message : String(e);
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

	const restore = () => run(() => api.post(`/api/items/${item.id}/restore`));

	/** After «Использовать / выкинуть»: stay when the item is still here, else go to its container. */
	async function afterDiscard() {
		try {
			const fresh = await api.get<{ item: { status: string } }>(`/api/items/${item.id}`);
			if (fresh.item.status === 'ACTIVE') return invalidateAll();
		} catch {
			// gone: fall through
		}
		const parent = card.path.at(-1);
		await goto(parent && !parent.isWorkbench ? `/items/${parent.id}` : '/containers');
	}
</script>

<svelte:head><title>{item.displayName} — Вещи</title></svelte:head>

{#if !active}
	<Alert color="red" class="mb-4">
		<p class="font-semibold">В архиве</p>
		<p class="mb-2">Вещь выкинута или использована. Её можно вернуть в каталог.</p>
		<Button size="sm" onclick={restore} disabled={busy}>Восстановить</Button>
	</Alert>
{/if}

<p class="text-sm text-gray-500 dark:text-gray-400"><PathTrail path={card.path} /></p>

<div class="mt-1 mb-3">
	<h1 class="text-2xl font-bold wrap-anywhere">{item.displayName}</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2">
		{#if card.type}
			<a href="/types/{card.type.id}">{card.type.name}</a>
		{:else if item.isWorkbench}
			<span class="text-sm text-gray-500 dark:text-gray-400">Рабочий стол</span>
		{/if}
		{#if card.type?.isContainer}<Badge color="indigo">контейнер</Badge>{/if}
		{#if item.quantity > 1}<Badge color="gray">{item.quantity} шт.</Badge>{/if}
		{#if item.takenById}<Badge color="yellow">на столе</Badge>{/if}
	</div>
	{#if card.type?.description}
		<p class="mt-1 text-sm whitespace-pre-line text-gray-500 dark:text-gray-400">
			{card.type.description}
		</p>
	{/if}
</div>

{#if card.type}
	{@const type = card.type}
	<PhotoField
		photoKey={type.photoKey}
		alt="Фото типа «{type.name}»"
		editable={active}
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

{#if active && !item.isWorkbench}
	<div class="my-3 flex flex-wrap gap-2">
		<TakeToWorkbench item={{ id: item.id, quantity: item.quantity, name: item.displayName }} />
		<Button color="alternative" onclick={toggleMoving}>
			<ArrowsRepeatOutline class="me-1.5 h-5 w-5" />
			Переложить
		</Button>
		<Button color="alternative" href="/items/{item.id}/edit">
			<PenOutline class="me-1.5 h-5 w-5" />
			Изменить
		</Button>
	</div>
	{#if moving}
		<div class="mb-3 space-y-2">
			{#if item.quantity > 1}
				<QuantityField
					available={item.quantity}
					bind:value={moveQuantity}
					label="Сколько переложить"
				/>
			{/if}
			<ContainerPicker
				title="Куда переложить «{item.displayName}»?"
				excludeId={item.id}
				excludeIds={item.parentId && !item.takenById ? [item.parentId] : []}
				onpick={(c) => {
					if (!quantityError(item.quantity, moveQuantity)) moveTo(c.id);
				}}
			/>
			{#if item.parentId}
				<Button
					color="alternative"
					onclick={() => moveTo(null)}
					disabled={busy || !!quantityError(item.quantity, moveQuantity)}
				>
					На верхний уровень
				</Button>
			{/if}
		</div>
	{/if}
{/if}
{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

{#if !item.isWorkbench}
	<Card class="mt-3 max-w-none p-4">
		<StickerPanel itemId={item.id} sticker={card.sticker} editable={active} />
	</Card>

	<h2 class="mt-6 mb-2 text-lg font-semibold">Индивидуальные параметры</h2>
	<ParamSection
		params={card.itemParams}
		target={{ kind: 'item', id: item.id }}
		editable={active}
		emptyText="Только у этой вещи параметров нет."
	/>

	{#if card.type}
		<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
		<ParamSection
			params={card.typeParams}
			target={{ kind: 'type', id: card.type.id }}
			editable={active}
			exclude={card.itemParams.map((p) => p.defId)}
		/>
	{/if}
{/if}

{#if container}
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

{#if active && !item.isWorkbench}
	<div class="mt-8">
		<DiscardDialog
			item={{
				id: item.id,
				name: item.displayName,
				quantity: item.quantity,
				hasChildren: card.children.length > 0
			}}
			ondone={afterDiscard}
		/>
	</div>
{/if}
