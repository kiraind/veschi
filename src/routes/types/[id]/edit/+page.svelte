<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Checkbox, Helper, Input, Label, Textarea } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { type } = data.card;
	let name = $state(type.name);
	let description = $state(type.description ?? '');
	let isContainer = $state(type.isContainer);
	let busy = $state(false);
	let error = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/types/${type.id}`, { name, description, isContainer });
			await goto(`/types/${type.id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
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

<form class="flex flex-col gap-3" onsubmit={save}>
	<Label>
		Название
		<Input class="mt-1" bind:value={name} required />
	</Label>
	<Label>
		Описание (необязательно)
		<Textarea
			class="mt-1"
			bind:value={description}
			rows={4}
			placeholder="Что это, для чего, чем отличается — поиск находит и по описанию"
		/>
	</Label>
	<div>
		<Checkbox bind:checked={isContainer}>Контейнер</Checkbox>
		<Helper class="mt-1 ps-6">
			В вещи этого типа можно класть другие вещи; количество у каждой — 1. Снять отметку можно,
			когда в них пусто.
		</Helper>
	</div>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy}>Сохранить</Button>
		<Button color="alternative" href="/types/{type.id}">Отмена</Button>
	</div>
</form>
