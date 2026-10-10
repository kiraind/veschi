<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import DiscardDialog from '$lib/components/DiscardDialog.svelte';
	import ItemContents from '$lib/components/ItemContents.svelte';
	import ParamList from '$lib/components/ParamList.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import StickerPanel from '$lib/components/StickerPanel.svelte';
	import TakeToWorkbench from '$lib/components/TakeToWorkbench.svelte';
	import ItemPhoto from '$lib/components/ItemPhoto.svelte';
	import { Alert, Badge, Button, Card } from 'flowbite-svelte';
	import { ArrowsRepeatOutline, PenOutline, PlusOutline } from 'flowbite-svelte-icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const card = $derived(data.card);
	const item = $derived(card.item);
	const active = $derived(item.status === 'ACTIVE');
	const container = $derived(item.isContainer || item.isWorkbench);

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

	const moveTo = (parentId: string | null) =>
		run(() => api.post(`/api/items/${item.id}/move`, { parentId }));

	/** «Добавить сюда» → existing item: move the picked item into this container. */
	const moveHere = (childId: string) =>
		run(() => api.post(`/api/items/${childId}/move`, { parentId: item.id }));

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
		{#if item.isContainer && !item.isWorkbench}<Badge color="indigo">контейнер</Badge>{/if}
		{#if item.quantity > 1}<Badge color="gray">{item.quantity} шт.</Badge>{/if}
		{#if item.takenById}<Badge color="yellow">на столе</Badge>{/if}
	</div>
</div>

{#if !item.isWorkbench}
	<ItemPhoto
		itemId={item.id}
		photoKey={item.photoKey}
		typePhotoKey={card.type?.photoKey ?? null}
		editable={active}
	/>
{/if}

{#if active && !item.isWorkbench}
	<div class="my-3 flex flex-wrap gap-2">
		<TakeToWorkbench item={{ id: item.id, quantity: item.quantity, name: item.displayName }} />
		<Button color="alternative" onclick={() => (moving = !moving)}>
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
			<ContainerPicker
				title="Куда переложить «{item.displayName}»?"
				excludeId={item.id}
				onpick={(c) => moveTo(c.id)}
			/>
			{#if card.path.length > 0}
				<Button color="alternative" onclick={() => moveTo(null)} disabled={busy}>
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

	<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
	<ParamList params={card.params} showSource />
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
			<Button color="alternative" onclick={() => (adding = !adding)}>
				{adding ? 'Отмена' : 'Положить сюда существующую'}
			</Button>
		</div>
		{#if adding}
			<ContainerPicker
				title="Что положить в «{item.displayName}»? Найдите вещь или отсканируйте её наклейку"
				excludeId={item.id}
				containersOnly={false}
				onpick={(c) => moveHere(c.id)}
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
