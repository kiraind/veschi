<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { page } from '$app/state';
	import { Alert, Button, Card, Checkbox, Helper, Input, Label } from 'flowbite-svelte';
	import { CameraPhotoOutline } from 'flowbite-svelte-icons';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form starts from the page data once (sticker caption → name, ?parent → container).
	// svelte-ignore state_referenced_locally
	const freeSticker = data.sticker?.status === 'free' ? data.sticker : null;
	// svelte-ignore state_referenced_locally
	let typeId = $state<string | null>(data.type?.id ?? null);
	// svelte-ignore state_referenced_locally
	let typeName = $state(data.type?.name ?? '');
	let name = $state(freeSticker?.caption ?? '');
	let quantity = $state(1);
	// svelte-ignore state_referenced_locally
	let parent = $state(
		data.parent
			? { id: data.parent.id, name: data.parent.name, path: formatPath(data.parent.path) }
			: null
	);
	let isContainer = $state(page.url.searchParams.get('container') === '1');
	let photo = $state<File | null>(null);
	let photoUrl = $derived(photo ? URL.createObjectURL(photo) : null);
	let photoInput = $state<HTMLInputElement>();
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		const url = photoUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/items', {
				...(typeId ? { typeId } : { newTypeName: typeName }),
				name,
				quantity,
				parentId: parent?.id ?? null,
				isContainer,
				stickerCode: freeSticker?.code
			});
			if (photo) {
				const body = new FormData();
				body.set('file', photo);
				try {
					await api.put(`/api/items/${id}/photo`, body);
				} catch (e) {
					// The item exists already: show its card, the photo can be added there.
					alert(`Вещь создана, но фото не сохранилось: ${e instanceof ApiError ? e.message : e}`);
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

	<TypeAutocomplete bind:typeId bind:typeName />

	<div>
		<Label for="item-name">Своё название (необязательно)</Label>
		<Input
			id="item-name"
			class="mt-1"
			bind:value={name}
			placeholder="Например, Коробка с микросхемами"
		/>
	</div>

	<div>
		<Label for="item-quantity">Количество</Label>
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
	</div>

	<div>
		<Checkbox bind:checked={isContainer}>Это контейнер</Checkbox>
		<Helper class="mt-1 ps-6">В контейнер можно класть другие вещи: шкаф, ящик, коробка.</Helper>
	</div>

	<div class="space-y-2">
		<span class="text-sm font-medium">Фото (необязательно)</span>
		{#if photoUrl}
			<img
				class="max-h-64 rounded-lg bg-gray-100 object-contain dark:bg-gray-800"
				src={photoUrl}
				alt="Фото вещи"
			/>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button type="button" color="alternative" size="sm" onclick={() => photoInput?.click()}>
				<CameraPhotoOutline class="me-1.5 h-5 w-5" />
				{photo ? 'Другое фото' : 'Сфотографировать'}
			</Button>
			{#if photo}
				<Button type="button" color="alternative" size="sm" onclick={() => (photo = null)}>
					Без фото
				</Button>
			{/if}
		</div>
		<input
			bind:this={photoInput}
			class="hidden"
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			onchange={(e) => {
				photo = e.currentTarget.files?.[0] ?? null;
				e.currentTarget.value = '';
			}}
		/>
	</div>

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
