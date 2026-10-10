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
	import Thumb from '$lib/components/Thumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const card = $derived(data.card);
	const item = $derived(card.item);
	const active = $derived(item.status === 'ACTIVE');

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
		await goto(parent && !parent.isWorkbench ? `/items/${parent.id}` : '/');
	}
</script>

<svelte:head><title>{item.displayName} — Вещи</title></svelte:head>

{#if !active}
	<div class="card banner stack">
		<strong>В архиве</strong>
		<span class="muted">Вещь выкинута или использована. Её можно вернуть в каталог.</span>
		<div><button class="primary" onclick={restore} disabled={busy}>Восстановить</button></div>
	</div>
{/if}

<p class="muted path"><PathTrail path={card.path} /></p>

<div class="row head">
	{#if card.type}<Thumb photoKey={card.type.photoKey} size={72} />{/if}
	<div class="title">
		<h1>{item.displayName}</h1>
		{#if card.type}
			<a href="/types/{card.type.id}">{card.type.name}</a>
		{:else if item.isWorkbench}
			<span class="muted">Рабочий стол</span>
		{/if}
		{#if item.quantity > 1}<span class="badge">{item.quantity} шт.</span>{/if}
		{#if item.takenById}<span class="badge">на столе</span>{/if}
	</div>
</div>

{#if active && !item.isWorkbench}
	<div class="row actions">
		<TakeToWorkbench item={{ id: item.id, quantity: item.quantity, name: item.displayName }} />
		<button onclick={() => (moving = !moving)}>Переложить</button>
		<a class="button" href="/items/{item.id}/edit">Изменить</a>
	</div>
	{#if moving}
		<ContainerPicker
			title="Куда переложить «{item.displayName}»?"
			excludeId={item.id}
			onpick={(c) => moveTo(c.id)}
		/>
		{#if card.path.length > 0}
			<button onclick={() => moveTo(null)} disabled={busy}>На верхний уровень</button>
		{/if}
	{/if}
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if !item.isWorkbench}
	<section class="card">
		<StickerPanel itemId={item.id} sticker={card.sticker} editable={active} />
	</section>

	<h2>Параметры</h2>
	<ParamList params={card.params} showSource />
{/if}

<h2>Содержимое</h2>
{#if card.children.length > 0}
	<ItemContents entries={card.children} />
{:else}
	<p class="muted">Пусто.</p>
{/if}
{#if active}
	<div class="row actions">
		<a class="button" href="/items/new?parent={item.id}">+ Новая вещь сюда</a>
		<button onclick={() => (adding = !adding)}>
			{adding ? 'Отмена' : 'Положить сюда существующую'}
		</button>
	</div>
	{#if adding}
		<ContainerPicker
			title="Что положить в «{item.displayName}»? Найдите вещь или отсканируйте её наклейку"
			excludeId={item.id}
			onpick={(c) => moveHere(c.id)}
		/>
	{/if}
{/if}

{#if active && !item.isWorkbench}
	<div class="discard">
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

<style>
	.banner {
		border-color: var(--danger);
		margin-bottom: 1rem;
	}
	.path {
		margin: 0;
	}
	.head {
		flex-wrap: nowrap;
		align-items: flex-start;
	}
	.title h1 {
		margin: 0 0 0.25rem;
		overflow-wrap: anywhere;
	}
	.title {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: center;
	}
	.title h1 {
		flex-basis: 100%;
	}
	.actions {
		margin: 0.75rem 0;
	}
	.discard {
		margin-top: 2rem;
	}
</style>
