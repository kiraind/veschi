<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { page } from '$app/state';
	import { Alert, Button, Card, Checkbox, Helper, Input, Label } from 'flowbite-svelte';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import ParamValueInput from '$lib/components/ParamValueInput.svelte';
	import type { TypeCard, TypeInfo } from '$lib/server/services/types';
	import {
		inCategories,
		requiredAt,
		type CategorySummary,
		type RequiredParam
	} from '$lib/domain/categories';
	import type { CategoryCard } from '$lib/server/services/categories';
	import { untrack } from 'svelte';
	import { draftToInput, emptyDraft, type ParamDraft } from '$lib/domain/param-draft';
	import { paramInputSchema, type ParamInput } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form starts from the page data once (sticker caption → name, ?parent → container).
	// svelte-ignore state_referenced_locally
	const freeSticker = data.sticker?.status === 'free' ? data.sticker : null;
	// svelte-ignore state_referenced_locally
	let typeId = $state<string | null>(data.type?.id ?? null);
	// svelte-ignore state_referenced_locally
	let typeName = $state(data.type?.name ?? '');
	// svelte-ignore state_referenced_locally
	let selectedType = $state<TypeInfo | null>(data.type);
	let name = $state(freeSticker?.caption ?? '');
	let quantity = $state(1);
	// svelte-ignore state_referenced_locally
	let parent = $state(
		data.parent
			? { id: data.parent.id, name: data.parent.name, path: formatPath(data.parent.path) }
			: null
	);
	/** A new type is a container type (an existing type has its own mark). */
	let newTypeIsContainer = $state(page.url.searchParams.get('container') === '1');
	const isContainer = $derived(selectedType ? selectedType.isContainer : newTypeIsContainer);
	/** An existing type keeps its photo; a photo can be added when it has none. */
	const askPhoto = $derived(!selectedType?.photoKey);
	let photo = $state<File | null>(null);
	let photoUrl = $derived(photo ? URL.createObjectURL(photo) : null);
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

	/** Categories to put a new type into (an existing type has its own). */
	let categories = $state<CategorySummary[]>([]);
	let newTypeCategoryIds = $state<string[]>([]);
	$effect(() => {
		api.get<CategorySummary[]>('/api/categories').then((list) => (categories = list));
	});

	function toggleCategory(id: string) {
		newTypeCategoryIds = newTypeCategoryIds.includes(id)
			? newTypeCategoryIds.filter((c) => c !== id)
			: [...newTypeCategoryIds, id];
	}

	/** What the categories of the type (or of the new type) require on each item. */
	async function loadRequired(id: string | null, categoryIds: string[]): Promise<RequiredParam[]> {
		if (id) return (await api.get<TypeCard>(`/api/types/${id}`)).itemRequired;
		const cards = await Promise.all(
			categoryIds.map((c) => api.get<CategoryCard>(`/api/categories/${c}`))
		);
		return requiredAt(
			cards.flatMap((card) =>
				card.params.map((p) => ({
					categoryId: card.category.id,
					categoryName: card.category.name,
					def: p.def,
					level: p.level
				}))
			),
			'ITEM'
		);
	}

	/**
	 * Parameters the type's categories require on each item, with their values
	 * being typed (kept when the list changes).
	 */
	let required = $state<{ r: RequiredParam; draft: ParamDraft }[]>([]);
	let requiredKey = '';
	$effect(() => {
		const id = typeId;
		const categoryIds = id ? [] : [...newTypeCategoryIds];
		const key = id ?? categoryIds.join(',');
		requiredKey = key;
		loadRequired(id, categoryIds)
			.then((list) => {
				if (requiredKey !== key) return;
				const typed = new Map(untrack(() => required).map((e) => [e.r.def.id, e.draft]));
				required = list.map((r) => ({ r, draft: typed.get(r.def.id) ?? emptyDraft(r.def) }));
			})
			.catch((e) => (error = e instanceof ApiError ? e.message : String(e)));
	});

	/** Values of the required parameters, or an error message. */
	function requiredParams(): ParamInput[] | string {
		const result: ParamInput[] = [];
		for (const { r, draft } of required) {
			const parsed = paramInputSchema.safeParse(draftToInput(draft));
			if (!parsed.success) {
				return `«${r.def.name}»: ${parsed.error.issues[0]?.message ?? 'проверьте значение'}`;
			}
			result.push(parsed.data);
		}
		return result;
	}

	$effect(() => {
		const url = photoUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const params = requiredParams();
		if (typeof params === 'string') {
			error = params;
			return;
		}
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/items', {
				params,
				...(typeId
					? { typeId }
					: { newTypeName: typeName, newTypeIsContainer, newTypeCategoryIds }),
				name,
				// A container is a single instance: its quantity is always 1.
				quantity: isContainer || freeSticker ? 1 : quantity,
				parentId: parent?.id ?? null,
				stickerCode: freeSticker?.code
			});
			if (photo && askPhoto) {
				const body = new FormData();
				body.set('file', photo);
				try {
					// The photo belongs to the type; only a type without a photo gets one here.
					const card = await api.get<{ type: TypeInfo | null }>(`/api/items/${id}`);
					if (card.type && !card.type.photoKey) {
						await api.put(`/api/types/${card.type.id}/photo`, body);
					}
				} catch (e) {
					// The item exists already: show its card, the photo can be added there.
					await confirmAction({
						title: 'Вещь создана, но фото не сохранилось',
						message: e instanceof ApiError ? e.message : String(e),
						confirmLabel: 'Понятно',
						cancelLabel: null,
						danger: false
					});
				}
			}
			await goto(`/items/${id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Новая вещь — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">{isContainer ? 'Новый контейнер' : 'Новая вещь'}</h1>

{#if data.sticker && !freeSticker}
	<Alert color="yellow" class="mb-4">
		Наклейку нельзя привязать: {data.sticker.status === 'bound'
			? 'она уже привязана'
			: data.sticker.status === 'written_off'
				? 'она списана'
				: 'такой наклейки нет'}. Вещь будет создана без наклейки.
	</Alert>
{/if}

<form class="flex flex-col gap-4" onsubmit={submit}>
	{#if freeSticker?.code}
		<p>Наклейка <strong class="font-mono">{formatCode(freeSticker.code)}</strong></p>
	{/if}

	<TypeAutocomplete bind:typeId bind:typeName bind:selected={selectedType} />

	<div>
		<Label for="item-name">Название этой конкретной вещи (необязательно)</Label>
		<Input
			id="item-name"
			class="mt-1"
			bind:value={name}
			placeholder="Например, Коробка с микросхемами"
		/>
	</div>

	{#if !selectedType}
		<div>
			<Checkbox bind:checked={newTypeIsContainer}>Это контейнер</Checkbox>
			<Helper class="mt-1 ps-6">
				Вещи этого типа — контейнеры: в них можно класть другие вещи (шкаф, ящик, коробка).
			</Helper>
		</div>
		{#if categories.length}
			<div>
				<span class="text-sm font-medium">Категории (необязательно)</span>
				<div class="mt-1 flex flex-wrap gap-2" role="group" aria-label="Категории нового типа">
					{#each categories as category (category.id)}
						{@const on = newTypeCategoryIds.includes(category.id)}
						<button
							type="button"
							class="h-10 rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none {on
								? 'border-primary-700 bg-primary-700 text-white dark:border-primary-600 dark:bg-primary-600'
								: 'border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}"
							aria-pressed={on}
							onclick={() => toggleCategory(category.id)}>{category.name}</button
						>
					{/each}
				</div>
				{#if newTypeCategoryIds.length}
					<Helper class="mt-1">Параметры «у типа» заполните потом на странице типа.</Helper>
				{/if}
			</div>
		{/if}
	{/if}

	{#if !isContainer}
		<div>
			<Label for="item-quantity">Количество</Label>
			{#if freeSticker}
				<Input id="item-quantity" class="mt-1" type="number" value={1} disabled />
				<Helper class="mt-1">
					У вещи с наклейкой количество всегда 1: наклейка обозначает одну вещь.
				</Helper>
			{:else}
				<Input
					id="item-quantity"
					class="mt-1"
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					bind:value={quantity}
					required
				/>
			{/if}
		</div>
	{/if}

	{#each required as entry (entry.r.def.id)}
		<div class="space-y-1">
			<span class="text-sm font-medium">{entry.r.def.name}</span>
			<ParamValueInput bind:draft={entry.draft} def={entry.r.def} />
			<Helper>Обязателен {inCategories(entry.r.categories)}</Helper>
		</div>
	{/each}

	{#if askPhoto}
		<div class="space-y-1">
			<span class="text-sm font-medium">Фото (необязательно)</span>
			<PhotoField
				previewUrl={photoUrl}
				container={isContainer}
				alt="Фото типа"
				onfile={async (file) => {
					photo = file;
				}}
				onremove={photo
					? async () => {
							photo = null;
						}
					: undefined}
			/>
		</div>
	{/if}

	<Card class="max-w-none space-y-2 p-4">
		<span class="text-sm text-gray-500 dark:text-gray-400">Где лежит</span>
		<p class="break-words">
			{parent ? [parent.path, parent.name].filter(Boolean).join(' → ') : 'Верхний уровень'}
		</p>
		<div class="flex flex-wrap gap-2">
			<Button type="button" color="alternative" size="sm" onclick={() => (picking = !picking)}>
				{picking ? 'Отмена' : 'Выбрать контейнер'}
			</Button>
			{#if parent}
				<Button type="button" color="alternative" size="sm" onclick={() => (parent = null)}>
					На верхний уровень
				</Button>
			{/if}
		</div>
		{#if picking}
			<ContainerPicker
				onpick={(c) => {
					parent = { ...c, path: '' };
					picking = false;
				}}
			/>
		{/if}
	</Card>

	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<Button type="submit" disabled={busy || !typeName.trim()} loading={busy}>
		{busy ? 'Сохранение…' : 'Создать'}
	</Button>
</form>
