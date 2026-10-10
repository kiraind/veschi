<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import type { TypeInfo } from '$lib/server/services/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { item, type } = data.card;
	let typeId = $state<string | null>(type?.id ?? null);
	let typeName = $state(type?.name ?? '');
	let selectedType = $state<TypeInfo | null>(type);
	let name = $state(item.name ?? '');
	let quantity = $state(item.quantity);
	/** A new type (typed name) is an ordinary one; containers come from their type. */
	const isContainer = $derived(selectedType?.isContainer ?? false);
	let busy = $state(false);
	let error = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/items/${item.id}`, {
				...(typeId ? { typeId } : { newTypeName: typeName }),
				name,
				// A container is a single instance: its quantity is always 1.
				quantity: isContainer ? 1 : quantity
			});
			await goto(`/items/${item.id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Изменить: {item.displayName} — Вещи</title></svelte:head>

<a
	href="/items/{item.id}"
	class="mb-2 inline-flex min-h-10 items-center gap-1 text-sm text-primary-700 hover:underline dark:text-primary-400"
>
	<ArrowLeftOutline class="h-4 w-4" />
	<span class="break-words">{item.displayName}</span>
</a>
<h1 class="mb-3 text-2xl font-bold">Изменить вещь</h1>

<form class="flex flex-col gap-4" onsubmit={save}>
	<TypeAutocomplete bind:typeId bind:typeName bind:selected={selectedType} />
	<div>
		<Label for="item-name">Своё название (необязательно)</Label>
		<Input id="item-name" class="mt-1" bind:value={name} placeholder={typeName} />
	</div>
	{#if !isContainer}
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
	{:else if item.quantity > 1}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Сейчас {item.quantity} шт. — у контейнера количество всегда 1, после сохранения будет 1.
		</p>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy || !typeName.trim()} loading={busy}>Сохранить</Button>
		<Button href="/items/{item.id}" color="alternative">Отмена</Button>
	</div>
</form>
