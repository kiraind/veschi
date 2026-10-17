<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, Input } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { pieces } from '$lib/domain/plural';
	import { searchKey } from '$lib/domain/search';
	import Thumb from '$lib/components/Thumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The field on top filters by name and description; a name no type has yet can be created. */
	let name = $state('');
	let error = $state('');
	let busy = $state(false);

	const shown = $derived.by(() => {
		const q = searchKey(name);
		return data.types.filter((t) => searchKey(`${t.name}\n${t.description ?? ''}`).includes(q));
	});
	const exact = $derived.by(() => {
		const q = name.trim().toLocaleLowerCase('ru');
		return data.types.some((t) => t.name.toLocaleLowerCase('ru') === q);
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const { id } = await api.post<{ id: string }>('/api/types', { name });
			await goto(`/types/${id}`);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Типы вещей — veschi</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">Типы вещей</h1>

<form class="flex gap-2" onsubmit={create}>
	<div class="min-w-0 flex-1">
		<Input
			type="search"
			bind:value={name}
			placeholder="Найти тип или ввести новый"
			aria-label="Найти тип или ввести новый"
			autocomplete="off"
			required
		/>
	</div>
	<Button type="submit" disabled={busy || !name.trim() || exact} class="shrink-0">Создать</Button>
</form>
{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

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
			<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400"
				>{type.total ? pieces(type.total) : 'нет вещей'}</span
			>
		</li>
	{:else}
		<li class="text-sm text-gray-500 dark:text-gray-400">
			{name.trim() ? 'Ничего не найдено.' : 'Типов нет.'}
		</li>
	{/each}
</ul>
