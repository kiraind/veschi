<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import ParamEditor from '$lib/components/ParamEditor.svelte';
	import type { ParamInput } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { type, params } = data.card;
	let name = $state(type.name);
	let busy = $state(false);
	let error = $state('');

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/types/${type.id}`, { name });
			await goto(`/types/${type.id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveParams(list: ParamInput[]) {
		await api.put(`/api/types/${type.id}/params`, { params: list });
		await invalidateAll();
	}
</script>

<svelte:head><title>Изменить тип: {type.name} — Вещи</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex max-w-full items-center gap-1 py-2 text-sm break-words text-primary-700 hover:underline dark:text-primary-400"
		href="/types/{type.id}"><ArrowLeftOutline class="h-4 w-4 shrink-0" />{type.name}</a
	>
</p>
<h1 class="mb-3 text-2xl font-bold">Изменить тип</h1>

<form class="flex flex-col gap-3" onsubmit={rename}>
	<Label>
		Название
		<Input class="mt-1" bind:value={name} required />
	</Label>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy}>Сохранить название</Button>
	</div>
</form>

<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры типа</h2>
<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">Видны у всех вещей этого типа.</p>
<ParamEditor initial={params} onsave={saveParams} />
