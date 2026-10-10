<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, Input } from 'flowbite-svelte';
	import { api, ApiError } from '$lib/api';
	import Thumb from '$lib/components/Thumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let filter = $state('');
	let name = $state('');
	let error = $state('');
	let busy = $state(false);

	const shown = $derived.by(() => {
		const q = filter.trim().toLocaleLowerCase('ru');
		return data.types.filter((t) =>
			`${t.name}\n${t.description ?? ''}`.toLocaleLowerCase('ru').includes(q)
		);
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/types', { name });
			await goto(`/types/${id}`);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Типы вещей — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Типы вещей</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Тип описывает, что это за вещь: название, описание, фото и общие параметры всех её экземпляров.
</p>

<form class="flex gap-2" onsubmit={create}>
	<div class="min-w-0 flex-1">
		<Input bind:value={name} placeholder="Новый тип, например «Нож Victorinox»" required />
	</div>
	<Button type="submit" disabled={busy} class="shrink-0">Создать</Button>
</form>
{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

{#if data.types.length > 10}
	<Input class="mt-4" type="search" bind:value={filter} placeholder="Фильтр" aria-label="Фильтр" />
{/if}

<ul class="mt-4 flex flex-col gap-2">
	{#each shown as type (type.id)}
		<li
			class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
		>
			<Thumb photoKey={type.photoKey} size={40} container={type.isContainer} />
			<div class="min-w-0 flex-1 py-1">
				<a
					class="font-medium break-words text-primary-700 hover:underline dark:text-primary-400"
					href="/types/{type.id}">{type.name}</a
				>
				{#if type.isContainer}<Badge color="indigo" class="ms-1">контейнер</Badge>{/if}
				{#if type.description}
					<p class="line-clamp-1 text-sm text-gray-500 dark:text-gray-400">{type.description}</p>
				{/if}
			</div>
			<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400">{type.itemCount} зап.</span>
		</li>
	{:else}
		<li class="text-sm text-gray-500 dark:text-gray-400">Типов нет.</li>
	{/each}
</ul>
