<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { formatBarcode } from '$lib/domain/barcode';
	import { page } from '$app/state';
	import { Button, Card, Checkbox, Helper, Input, Label, Radio } from 'flowbite-svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import PhotoField from '$lib/components/PhotoField.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import ParamValueInput from '$lib/components/ParamValueInput.svelte';
	import CategoryMultiSelect from '$lib/components/CategoryMultiSelect.svelte';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import RequiredMark from '$lib/components/RequiredMark.svelte';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import { pickWorkbench } from '$lib/domain/workbench';
	import { currentPosition } from '$lib/position';
	import type { TypeCard, TypeInfo } from '$lib/server/services/types';
	import { inCategories, requiredAt, type RequiredParam } from '$lib/domain/categories';
	import type { CategoryCard } from '$lib/server/services/categories';
	import { untrack } from 'svelte';
	import { draftToInput, emptyDraft, type ParamDraft } from '$lib/domain/param-draft';
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
	/**
	 * An existing type keeps its photo; a photo can be added when it has none
	 * and is not marked «Без фото».
	 */
	const askPhoto = $derived(!selectedType?.photoKey && !selectedType?.noPhoto);
	let photo = $state<File | null>(null);
	/** «Без фото» chosen here for the type. */
	let noPhoto = $state(false);
	let photoUrl = $derived(photo ? URL.createObjectURL(photo) : null);
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

	/** Categories to put a new type into (an existing type has its own). */
	let newTypeCategoryIds = $state<string[]>([]);

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
			.catch((e) => (error = errorText(e)));
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
				workbenchId: bench?.id,
				stickerCode: freeSticker?.code,
				barcode: data.barcode ?? undefined
			});
			if (noPhoto && !photo && askPhoto) {
				// Like the photo, the mark belongs to the type: set after the item exists.
				try {
					const card = await api.get<{ type: TypeInfo | null }>(`/api/items/${id}`);
					if (card.type && !card.type.photoKey) {
						await api.patch(`/api/types/${card.type.id}`, { noPhoto: true });
					}
				} catch {
					// Only the look of the card: the item is there, «Без фото» can be chosen on it.
				}
			}
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
						Параметры «у каждой вещи» форма спросит сразу. Параметры «у типа» заполните потом на
						странице типа — там они будут отмечены как «не заполнено».
					</p>
				</InfoHint></span
			>
			<div class="mt-1">
				<CategoryMultiSelect bind:selected={newTypeCategoryIds} />
			</div>
		</div>
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

	{#each required as entry (entry.r.def.id)}
		<div class="space-y-1">
			<span class="text-sm font-medium">{entry.r.def.name}<RequiredMark /></span>
			<ParamValueInput bind:draft={entry.draft} def={entry.r.def} />
			<Helper>Обязателен {inCategories(entry.r.categories)}</Helper>
		</div>
	{/each}

	{#if askPhoto}
		<div class="space-y-1">
			<span class="text-sm font-medium">Фото</span>
			<PhotoField
				previewUrl={photoUrl}
				container={isContainer}
				alt="Фото типа"
				{noPhoto}
				onnophoto={async (value) => {
					noPhoto = value;
				}}
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
