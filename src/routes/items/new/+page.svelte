<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { formatBarcode } from '$lib/domain/barcode';
	import { page } from '$app/state';
	import { Button, Card, Checkbox, Helper, Input, Label, Radio, Textarea } from 'flowbite-svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import CategoryMultiSelect from '$lib/components/CategoryMultiSelect.svelte';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import RequiredMark from '$lib/components/RequiredMark.svelte';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import { pickWorkbench } from '$lib/domain/workbench';
	import { currentPosition } from '$lib/position';
	import type { TypeCard, TypeInfo } from '$lib/server/services/types';
	import { requiredAt, type RequiredParam } from '$lib/domain/categories';
	import type { CategoryCard } from '$lib/server/services/categories';
	import { untrack } from 'svelte';
	import { draftToInput, isEmptyDraft } from '$lib/domain/param-draft';
	import { withRequired, type ParamEntry } from '$lib/domain/param-entries';
	import { DEFAULT_STICKER_WIDTH, type StickerWidth } from '$lib/domain/sticker-sheet';
	import ParamEntries from '$lib/components/ParamEntries.svelte';
	import StickerWidthSelect from '$lib/components/StickerWidthSelect.svelte';
	import { paramInputSchema, type ParamInput } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form starts from the page data once (sticker caption → type, ?parent → container).
	// svelte-ignore state_referenced_locally
	const freeSticker = data.sticker?.status === 'free' ? data.sticker : null;
	// svelte-ignore state_referenced_locally
	let typeId = $state<string | null>(data.type?.id ?? null);
	// svelte-ignore state_referenced_locally
	let typeName = $state(data.type?.name ?? data.newTypeName ?? '');
	// svelte-ignore state_referenced_locally
	let selectedType = $state<TypeInfo | null>(data.type);
	let name = $state('');
	let quantity = $state(1);
	// svelte-ignore state_referenced_locally
	let parent = $state(
		data.parent
			? { id: data.parent.id, name: data.parent.name, path: formatPath(data.parent.path) }
			: null
	);
	/** Without a container a new item goes on a workbench, picked as for «На стол». */
	// svelte-ignore state_referenced_locally
	let benchId = $state<string | null>(
		data.parent ? null : pickWorkbench(data.workbenches, null, data.lastWorkbenchId)
	);
	const bench = $derived(data.workbenches.find((b) => b.id === benchId) ?? null);
	// The bench whose zone we are in wins, unless another place was chosen meanwhile.
	$effect(() => {
		const first = untrack(() => benchId);
		if (!first || !data.workbenches.some((b) => b.geoRadiusM !== null)) return;
		currentPosition().then((position) => {
			if (position && benchId === first) {
				benchId = pickWorkbench(data.workbenches, position, data.lastWorkbenchId);
			}
		});
	});
	/** A new type is a container type (an existing type has its own mark). */
	let newTypeIsContainer = $state(page.url.searchParams.get('container') === '1');
	const isContainer = $derived(selectedType ? selectedType.isContainer : newTypeIsContainer);
	const heading = $derived(isContainer ? 'Новый контейнер' : 'Новая вещь');
	/** An existing type keeps its photo; a photo can be added when it has none. */
	const askPhoto = $derived(!selectedType?.photoKey);
	let photo = $state<File | null>(null);
	let photoUrl = $derived(photo ? URL.createObjectURL(photo) : null);
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

	/** Categories to put a new type into (an existing type has its own). */
	let newTypeCategoryIds = $state<string[]>([]);

	/** What the categories of the type (or of the new type) require on each item and on the type. */
	async function loadRequired(
		id: string | null,
		categoryIds: string[]
	): Promise<{ item: RequiredParam[]; type: RequiredParam[] }> {
		if (id) return { item: (await api.get<TypeCard>(`/api/types/${id}`)).itemRequired, type: [] };
		const cards = await Promise.all(
			categoryIds.map((c) => api.get<CategoryCard>(`/api/categories/${c}`))
		);
		const requirements = cards.flatMap((card) =>
			card.params.map((p) => ({
				categoryId: card.category.id,
				categoryName: card.category.name,
				def: p.def,
				level: p.level
			}))
		);
		return { item: requiredAt(requirements, 'ITEM'), type: requiredAt(requirements, 'TYPE') };
	}

	/**
	 * Parameter values of the new item and of the new type: those the categories
	 * require first, then those added with «Параметр» (typed values are kept when
	 * the requirements change).
	 */
	let itemParams = $state<ParamEntry[]>([]);
	let typeParams = $state<ParamEntry[]>([]);
	/** Description of a new type. */
	let typeDescription = $state('');
	let requiredKey = '';
	$effect(() => {
		const id = typeId;
		const categoryIds = id ? [] : [...newTypeCategoryIds];
		const key = id ?? categoryIds.join(',');
		requiredKey = key;
		loadRequired(id, categoryIds)
			.then((required) => {
				if (requiredKey !== key) return;
				itemParams = withRequired(
					untrack(() => itemParams),
					required.item
				);
				typeParams = withRequired(
					untrack(() => typeParams),
					required.type
				);
			})
			.catch((e) => (error = errorText(e)));
	});

	/**
	 * Values to save, or an error message. Values not typed are left out, unless
	 * required on each item (those of the type can be filled later).
	 */
	function paramInputs(entries: ParamEntry[], mandatory: boolean): ParamInput[] | string {
		const result: ParamInput[] = [];
		for (const { def, draft, categories } of entries) {
			if (isEmptyDraft(draft) && !(mandatory && categories.length > 0)) continue;
			const parsed = paramInputSchema.safeParse(draftToInput(draft));
			if (!parsed.success) {
				return `«${def.name}»: ${parsed.error.issues[0]?.message ?? 'проверьте значение'}`;
			}
			result.push(parsed.data);
		}
		return result;
	}

	/** «Нужна наклейка»: the next batch prints a sticker of this width for the item. */
	let orderSticker = $state(false);
	let stickerWidth = $state<StickerWidth>(DEFAULT_STICKER_WIDTH);

	$effect(() => {
		const url = photoUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const params = paramInputs(itemParams, true);
		const newTypeParams = typeId ? [] : paramInputs(typeParams, false);
		if (typeof params === 'string' || typeof newTypeParams === 'string') {
			error = typeof params === 'string' ? params : (newTypeParams as string);
			return;
		}
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/items', {
				params,
				...(typeId
					? { typeId }
					: {
							newTypeName: typeName,
							newTypeIsContainer,
							newTypeCategoryIds,
							newTypeDescription: typeDescription,
							newTypeParams
						}),
				name,
				// A container is a single instance: its quantity is always 1.
				quantity: isContainer || freeSticker ? 1 : quantity,
				parentId: parent?.id ?? null,
				workbenchId: bench?.id,
				stickerCode: freeSticker?.code,
				orderStickerWidth: !freeSticker && orderSticker ? stickerWidth : undefined,
				barcode: data.barcode ?? undefined
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
						message: errorText(e),
						confirmLabel: 'Понятно',
						cancelLabel: null,
						danger: false
					});
				}
			}
			await goto(`/items/${id}`, { replaceState: true });
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{heading} — veschi</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">{heading}</h1>

{#if data.sticker && !freeSticker}
	<Notice tone="warning" class="mb-4">
		Наклейку нельзя привязать: {data.sticker.status === 'bound'
			? 'она уже привязана'
			: data.sticker.status === 'written_off'
				? 'она списана'
				: 'такой наклейки нет'}. Вещь будет создана без наклейки.
	</Notice>
{/if}

<form class="flex flex-col gap-4" onsubmit={submit}>
	{#if freeSticker?.code}
		<p>Наклейка <strong class="font-mono">{formatCode(freeSticker.code)}</strong></p>
	{/if}
	{#if data.barcode}
		<p>
			Штрихкод <strong class="font-mono whitespace-nowrap">{formatBarcode(data.barcode)}</strong>
			<span class="block text-sm text-gray-500 dark:text-gray-400"
				>Привяжется к типу вещи: следующий скан откроет этот тип.</span
			>
		</p>
	{/if}

	<TypeAutocomplete bind:typeId bind:typeName bind:selected={selectedType} />

	<div>
		<Label for="item-name">Название этой конкретной вещи</Label>
		<Input
			id="item-name"
			class="mt-1"
			bind:value={name}
			placeholder={typeName.trim() || 'Например, Коробка с микросхемами'}
		/>
	</div>

	{#if !selectedType}
		<div>
			<Checkbox bind:checked={newTypeIsContainer}>Это контейнер</Checkbox>
			<Helper class="mt-1 ps-6">
				Вещи этого типа — контейнеры: в них можно класть другие вещи (шкаф, ящик, коробка).
			</Helper>
		</div>
		<div>
			<span class="text-sm font-medium"
				>Категории<InfoHint title="Категории нового типа">
					<p>
						Категория задаёт обязательные параметры типа, например у «Еды» — калорийность и срок
						годности.
					</p>
					<p>
						Параметры «у каждой вещи» нужно заполнить сразу. Параметры «у типа» можно оставить
						пустыми и заполнить потом на странице типа — там они будут отмечены как «не заполнено».
					</p>
				</InfoHint></span
			>
			<div class="mt-1">
				<CategoryMultiSelect bind:selected={newTypeCategoryIds} />
			</div>
		</div>
		<div>
			<Label for="type-description">Описание типа</Label>
			<Textarea
				id="type-description"
				class="mt-1 w-full"
				rows={3}
				maxlength={2000}
				bind:value={typeDescription}
				placeholder="Общее для всех вещей типа"
			/>
		</div>
		<section class="space-y-2">
			<h2 class="font-semibold">
				Параметры типа<InfoHint title="Параметры типа">
					<p>Значения общие для всех вещей этого типа, например производитель или напряжение.</p>
				</InfoHint>
			</h2>
			<ParamEntries bind:entries={typeParams} holder="TYPE" mandatory={false} />
		</section>
	{/if}

	{#if !isContainer}
		<div>
			<Label for="item-quantity">Количество<RequiredMark /></Label>
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

	<section class="space-y-2">
		<h2 class="font-semibold">
			Индивидуальные параметры<InfoHint title="Индивидуальные параметры">
				<p>Значения только этой вещи, например цвет или дата покупки.</p>
			</InfoHint>
		</h2>
		<ParamEntries bind:entries={itemParams} holder="ITEM" mandatory />
	</section>

	{#if askPhoto}
		<div class="space-y-1">
			<span class="text-sm font-medium">Фото</span>
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

	{#if !freeSticker}
		<div class="flex min-h-10 flex-wrap items-center gap-3">
			<Checkbox bind:checked={orderSticker}>Нужна наклейка</Checkbox>
			{#if orderSticker}
				<StickerWidthSelect value={stickerWidth} onpick={(w) => (stickerWidth = w)} />
			{/if}
		</div>
	{/if}

	<Card class="max-w-none space-y-2 p-4">
		<span class="text-sm text-gray-500 dark:text-gray-400">Где лежит</span>
		{#if bench}
			{#if data.workbenches.length === 1}
				<p class="break-words">
					<WorkbenchIcon icon={bench.icon} class="me-1 inline h-5 w-5 align-[-0.2em]" />На столе «{bench.name}»
				</p>
			{:else}
				<p>На столе</p>
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Рабочий стол">
					{#each data.workbenches as b (b.id)}
						<Radio
							name="new-item-bench"
							value={b.id}
							bind:group={benchId}
							classes={{
								label:
									'min-h-10 cursor-pointer rounded-lg border border-gray-200 px-3 text-base font-normal text-gray-900 dark:border-gray-700 dark:text-white'
							}}
						>
							<WorkbenchIcon icon={b.icon} class="me-1.5 h-5 w-5" />{b.name}
						</Radio>
					{/each}
				</div>
			{/if}
		{:else}
			<p class="break-words">
				{parent ? [parent.path, parent.name].filter(Boolean).join(' → ') : 'Верхний уровень'}
			</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button
				type="button"
				color="alternative"
				size="sm"
				class="h-10"
				onclick={() => (picking = !picking)}
			>
				{picking ? 'Отмена' : 'Выбрать контейнер'}
			</Button>
			{#if !bench && data.workbenches.length > 0}
				<Button
					type="button"
					color="alternative"
					size="sm"
					class="h-10"
					onclick={() => {
						parent = null;
						picking = false;
						benchId = pickWorkbench(data.workbenches, null, data.lastWorkbenchId);
					}}
				>
					На стол
				</Button>
			{/if}
			{#if parent || bench}
				<Button
					type="button"
					color="alternative"
					size="sm"
					class="h-10"
					onclick={() => {
						parent = null;
						benchId = null;
					}}
				>
					На верхний уровень
				</Button>
			{/if}
		</div>
		{#if picking}
			<ContainerPicker
				onpick={(c) => {
					parent = { ...c, path: '' };
					benchId = null;
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
