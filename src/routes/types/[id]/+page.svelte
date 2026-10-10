<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Badge, Button, Checkbox, Helper } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import ParamSection from '$lib/components/ParamSection.svelte';
	import EditButton from '$lib/components/EditButton.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import type { PageData } from './$types';
	import { confirmAction } from '$lib/confirm.svelte';

	let { data }: { data: PageData } = $props();

	const type = $derived(data.card.type);
	const total = $derived(data.card.items.reduce((sum, i) => sum + i.quantity, 0));
	let error = $state('');
	let renaming = $state(false);
	let describing = $state(false);
	let containerBusy = $state(false);
	let containerError = $state('');

	async function save(changes: { name?: string; description?: string; isContainer?: boolean }) {
		await api.patch(`/api/types/${type.id}`, changes);
		await invalidateAll();
	}

	/** The checkbox saves at once; a refused change (contents, quantities) puts it back. */
	async function setContainer(event: Event & { currentTarget: HTMLInputElement }) {
		const checked = event.currentTarget.checked;
		containerBusy = true;
		containerError = '';
		try {
			await save({ isContainer: checked });
		} catch (e) {
			event.currentTarget.checked = !checked;
			containerError = e instanceof ApiError ? e.message : String(e);
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
			error = e instanceof ApiError ? e.message : String(e);
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
<div class="flex items-start gap-1">
	<h1 class="text-2xl font-bold break-words">{type.name}</h1>
	<EditButton label="Изменить название" onclick={() => (renaming = true)} />
</div>
{#if type.isContainer}<div class="mt-1 mb-3"><Badge color="indigo">контейнер</Badge></div>{/if}

<PhotoField
	photoKey={type.photoKey}
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
/>

<div class="mt-4">
	<Checkbox checked={type.isContainer} disabled={containerBusy} onchange={setContainer}
		>Контейнер</Checkbox
	>
	<Helper class="mt-1 ps-6">
		В вещи этого типа можно класть другие вещи; количество у каждой — 1. Снять отметку можно, когда
		в них пусто.
	</Helper>
	{#if containerError}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
			{containerError}
		</p>{/if}
</div>

<div class="mt-6 flex items-start gap-1">
	{#if type.description}
		<p class="min-w-0 flex-1 pt-2 whitespace-pre-line text-gray-700 dark:text-gray-300">
			{type.description}
		</p>
	{:else}
		<p class="min-w-0 flex-1 pt-2 text-sm text-gray-500 dark:text-gray-400">Без описания</p>
	{/if}
	<EditButton label="Изменить описание" onclick={() => (describing = true)} />
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
<ParamSection params={data.card.params} target={{ kind: 'type', id: type.id }} />

<div class="mt-4 flex flex-wrap gap-2">
	<Button color="alternative" href="/items/new?type={type.id}">
		<PlusOutline class="me-1 h-4 w-4" />Вещь этого типа
	</Button>
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">
	Где лежит{#if total > 0}: всего {total} шт.{/if}
</h2>
{#if data.card.items.length === 0}
	<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">Вещей этого типа нет.</p>
	<Button color="red" outline onclick={remove}>Удалить тип</Button>
{:else}
	<ul class="flex flex-col gap-2">
		{#each data.card.items as item (item.id)}
			<li class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words">
				<PathTrail path={item.path} emptyText="верхний уровень" />
				<Badge color="gray" large href="/items/{item.id}" class="py-1.5 break-words">
					{item.name} · {item.quantity} шт.
				</Badge>
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
