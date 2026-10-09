<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
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
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

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
				stickerCode: freeSticker?.code
			});
			await goto(`/items/${id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Новая вещь — Вещи</title></svelte:head>

<h1>Новая вещь</h1>

{#if data.sticker && !freeSticker}
	<p class="error" role="alert">
		Наклейку нельзя привязать: {data.sticker.status === 'bound'
			? 'она уже привязана'
			: data.sticker.status === 'written_off'
				? 'она списана'
				: 'такой наклейки нет'}. Вещь будет создана без наклейки.
	</p>
{/if}

<form class="stack" onsubmit={submit}>
	{#if freeSticker?.code}
		<p>Наклейка <strong class="mono">{formatCode(freeSticker.code)}</strong></p>
	{/if}

	<TypeAutocomplete bind:typeId bind:typeName />

	<label>
		Своё название (необязательно)
		<input bind:value={name} placeholder="Например, Коробка с микросхемами" />
	</label>

	<label>
		Количество
		<input type="number" min="1" step="1" inputmode="numeric" bind:value={quantity} required />
	</label>

	<div class="stack place">
		<span class="muted">Где лежит</span>
		<div class="row">
			<span
				>{parent ? [parent.path, parent.name].filter(Boolean).join(' → ') : 'Верхний уровень'}</span
			>
			<button type="button" onclick={() => (picking = !picking)}>
				{picking ? 'Отмена' : 'Выбрать'}
			</button>
			{#if parent}
				<button type="button" onclick={() => (parent = null)}>На верхний уровень</button>
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
	</div>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<button class="primary" type="submit" disabled={busy || !typeName.trim()}>
		{busy ? 'Сохранение…' : 'Создать'}
	</button>
</form>

<style>
	.place {
		gap: 0.4rem;
	}
</style>
