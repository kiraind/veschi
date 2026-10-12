<script lang="ts">
	import HistoryLink from '$lib/components/HistoryLink.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlusOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import Description from '$lib/components/Description.svelte';
	import EditButton from '$lib/components/EditButton.svelte';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import ParamDefPicker from '$lib/components/ParamDefPicker.svelte';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import {
		PARAM_LEVELS,
		PARAM_LEVEL_LABELS,
		type CategoryParamInput,
		type ParamLevel
	} from '$lib/domain/categories';
	import { paramKindLabel, type ParamDefView } from '$lib/domain/params';
	import { plural } from '$lib/domain/plural';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const category = $derived(data.card.category);
	let renaming = $state(false);
	let describing = $state(false);
	let addingParam = $state(false);
	let addingType = $state(false);
	let typeId = $state<string | null>(null);
	let typeName = $state('');
	let busy = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	async function save(changes: { name?: string; description?: string }) {
		await api.patch(`/api/categories/${category.id}`, changes);
		await invalidateAll();
	}

	function current(): CategoryParamInput[] {
		return data.card.params.map((p) => ({ defId: p.def.id, level: p.level }));
	}

	function saveParams(params: CategoryParamInput[]) {
		return run(() => api.put(`/api/categories/${category.id}/params`, { params }));
	}

	function setLevel(defId: string, level: ParamLevel) {
		saveParams(current().map((p) => (p.defId === defId ? { ...p, level } : p)));
	}

	async function addParam(def: ParamDefView) {
		addingParam = false;
		// A link can be required only where it lives.
		await saveParams([...current(), { defId: def.id, level: def.holder ?? 'TYPE' }]);
	}

	function removeParam(defId: string) {
		saveParams(current().filter((p) => p.defId !== defId));
	}

	// Picking a type in the field puts it into the category at once.
	$effect(() => {
		const id = typeId;
		if (!id) return;
		run(async () => {
			await api.post(`/api/types/${id}/categories`, { categoryId: category.id });
			typeId = null;
			typeName = '';
			addingType = false;
		});
	});

	async function remove() {
		const ok = await confirmAction({
			title: `Удалить категорию «${category.name}»?`,
			message: data.card.types.length
				? 'Типы останутся, но её параметры перестанут быть обязательными.'
				: undefined
		});
		if (!ok) return;
		error = '';
		try {
			await api.delete(`/api/categories/${category.id}`);
			await goto('/categories');
		} catch (e) {
			error = errorText(e);
		}
	}

	const levelButton = (active: boolean) =>
		`h-10 px-3 text-sm font-medium first:rounded-s-lg last:rounded-e-lg border focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none ${
			active
				? 'z-10 border-primary-700 bg-primary-700 text-white dark:border-primary-600 dark:bg-primary-600'
				: 'border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
		}`;
</script>

<svelte:head><title>{category.name} — Категории</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/categories"><ArrowLeftOutline class="h-4 w-4" />Категории</a
	>
</p>
<!-- Named by the text alone: the pen is not part of the heading's name. -->
<h1 class="text-2xl font-bold wrap-anywhere" aria-labelledby="page-title">
	<span id="page-title">{category.name}</span><EditButton
		label="Изменить название"
		onclick={() => (renaming = true)}
	/>
</h1>

<div class="mt-4">
	<Description text={category.description} onedit={() => (describing = true)} />
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">
	Параметры<InfoHint title="Параметры категории">
		<p>Эти параметры обязательно заполнить у всех типов категории.</p>
		<p>
			<strong>У типа</strong> — одно значение на весь тип, например калорийность гречки.
		</p>
		<p>
			<strong>У каждой вещи</strong> — своё значение у каждой вещи, например срок годности пачки: без
			него новую вещь не создать.
		</p>
	</InfoHint>
</h2>
<div class="flex flex-col gap-3">
	{#each data.card.params as p (p.def.id)}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<div class="min-w-0 flex-1 basis-40">
				<a
					href="/params/{p.def.id}"
					class="font-medium break-words text-primary-700 hover:underline dark:text-primary-400"
					>{p.def.name}</a
				>
				<span class="block text-sm text-gray-500 dark:text-gray-400">{paramKindLabel(p.def)}</span>
			</div>
			<div class="flex items-center gap-2">
				<div class="inline-flex" role="group" aria-label="Где заполнять «{p.def.name}»">
					{#each PARAM_LEVELS as level (level)}
						<button
							type="button"
							class={levelButton(p.level === level)}
							aria-pressed={p.level === level}
							disabled={busy || (p.def.holder !== null && p.def.holder !== level)}
							onclick={() => p.level !== level && setLevel(p.def.id, level)}
							>{PARAM_LEVEL_LABELS[level].replace(/^у/, 'У')}</button
						>
					{/each}
				</div>
				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700"
					title="Убрать из категории"
					aria-label="Убрать «{p.def.name}» из категории"
					disabled={busy}
					onclick={() => removeParam(p.def.id)}><TrashBinOutline class="h-5 w-5" /></button
				>
			</div>
		</div>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">Параметров пока нет.</p>
	{/each}
	{#if addingParam}
		<ParamDefPicker
			onpick={addParam}
			oncancel={() => (addingParam = false)}
			exclude={data.card.params.map((p) => p.def.id)}
		/>
	{:else}
		<div>
			<Button color="alternative" size="sm" class="h-10" onclick={() => (addingParam = true)}>
				<PlusOutline class="me-1 h-4 w-4" />Параметр
			</Button>
		</div>
	{/if}
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">
	{data.card.types.length
		? `${data.card.types.length} ${plural(data.card.types.length, ['тип', 'типа', 'типов'])}`
		: 'Типы'}
</h2>
<ul class="flex flex-col gap-2">
	{#each data.card.types as type (type.id)}
		<li class="min-w-0">
			<a
				href="/types/{type.id}"
				class="font-semibold wrap-anywhere text-primary-700 hover:underline dark:text-primary-500"
				>{type.name}</a
			>
			<span class="text-sm text-gray-500 dark:text-gray-400">
				· {type.itemCount
					? `${type.itemCount} ${plural(type.itemCount, ['вещь', 'вещи', 'вещей'])}`
					: 'нет вещей'}
			</span>
			{#if type.missing.length}
				<p class="text-sm text-amber-700 dark:text-amber-400">
					Не заполнено: {type.missing.join(', ')}
				</p>
			{/if}
		</li>
	{:else}
		<li class="text-sm text-gray-500 dark:text-gray-400">
			Типов в категории нет. Добавьте тип здесь или на его странице.
		</li>
	{/each}
</ul>
<div class="mt-3">
	{#if addingType}
		<div class="flex flex-col gap-2">
			<TypeAutocomplete bind:typeId bind:typeName label="Добавить тип" />
			<div>
				<Button color="alternative" onclick={() => (addingType = false)}>Отмена</Button>
			</div>
		</div>
	{:else}
		<Button color="alternative" size="sm" class="h-10" onclick={() => (addingType = true)}>
			<PlusOutline class="me-1 h-4 w-4" />Тип
		</Button>
	{/if}
</div>

{#if data.card.incompleteItemCount}
	<h2 class="mt-6 mb-1 text-lg font-semibold">Вещи с незаполненным</h2>
	<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
		Обязательные значения у них не заполнены — заполните на карточке вещи.
	</p>
	<ul class="flex flex-col gap-2">
		{#each data.card.incompleteItems as item (item.id)}
			<li class="min-w-0">
				<a
					href="/items/{item.id}"
					class="wrap-anywhere text-primary-700 hover:underline dark:text-primary-500"
					>{item.name}</a
				>
				<span class="text-sm text-amber-700 dark:text-amber-400"
					>— нет: {item.missing.join(', ')}</span
				>
			</li>
		{/each}
	</ul>
	{#if data.card.incompleteItemCount > data.card.incompleteItems.length}
		<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
			И ещё {data.card.incompleteItemCount - data.card.incompleteItems.length}.
		</p>
	{/if}
{/if}

{#if error}<p class="mt-3 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<div class="mt-8">
	<Button color="red" outline onclick={remove}>Удалить категорию</Button>
</div>

<TextEditSheet
	bind:open={renaming}
	title="Название категории"
	label="Название"
	value={category.name}
	required
	onsave={(name) => save({ name })}
/>
<TextEditSheet
	bind:open={describing}
	title="Описание: {category.name}"
	label="Описание"
	value={category.description ?? ''}
	multiline
	placeholder="Что сюда входит"
	onsave={(description) => save({ description })}
/>

<div class="mt-6"><HistoryLink id={category.id} /></div>
