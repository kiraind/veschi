<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import Thumb from '$lib/components/Thumb.svelte';
	import { entryCountText, missingText, type CollectionRef } from '$lib/domain/collections';
	import { normalizeParamKey } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The field on top filters the list; a name nothing matches exactly can be created. */
	let query = $state('');
	let busy = $state(false);
	let error = $state('');
	const q = $derived(normalizeParamKey(query));
	const shown = $derived(
		data.collections.filter((c) =>
			normalizeParamKey(`${c.name} ${c.description ?? ''}`).includes(q)
		)
	);
	const exact = $derived(data.collections.some((c) => normalizeParamKey(c.name) === q));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!q || exact) return;
		busy = true;
		error = '';
		try {
			const collection = await api.post<CollectionRef>('/api/collections', { name: query });
			await goto(`/collections/${collection.id}`);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Коллекции — Вещи</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">
	Коллекции<InfoHint title="Что такое коллекция">
		<p>
			Коллекция — список вещей с количествами: например, всё для проекта «Умные весы» — кухонные
			весы, три микроконтроллера и две платы.
		</p>
		<p>
			В коллекцию можно добавить тип («ESP32 — 3 штуки», подойдут любые) или конкретную вещь («вот
			эти весы»). Вещи при этом остаются на своих местах, а коллекция показывает, сколько их есть и
			чего не хватает.
		</p>
	</InfoHint>
</h1>

<form class="flex gap-2" onsubmit={create}>
	<div class="min-w-0 flex-1">
		<Input
			type="search"
			bind:value={query}
			placeholder="Найти коллекцию или ввести новую"
			aria-label="Найти коллекцию или ввести новую"
			autocomplete="off"
		/>
	</div>
	<Button type="submit" class="shrink-0" disabled={busy || !q || exact}>
		<PlusOutline class="me-1 h-4 w-4" />Создать
	</Button>
</form>
{#if error}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<ul
	class="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
>
	{#each shown as c (c.id)}
		<li>
			<a
				href="/collections/{c.id}"
				class="flex min-h-12 flex-col gap-2 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700"
			>
				<span class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span class="min-w-0 font-medium break-words">{c.name}</span>
					<span class="text-sm text-gray-500 dark:text-gray-400">
						{entryCountText(c.entryCount)}
					</span>
				</span>
				{#if c.entryCount}
					<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span class="flex gap-1" aria-hidden="true">
							{#each c.photos as photo, i (i)}
								<Thumb photoKey={photo.photoKey} size={32} container={photo.isContainer} />
							{/each}
						</span>
						{#if c.missing}
							<span class="text-sm text-amber-700 dark:text-amber-400">
								{missingText(c.missing)}
							</span>
						{:else}
							<span class="text-sm text-gray-500 dark:text-gray-400">всё есть</span>
						{/if}
					</span>
				{/if}
			</a>
		</li>
	{:else}
		<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
			{data.collections.length ? 'Такой коллекции нет.' : 'Коллекций пока нет.'}
		</li>
	{/each}
</ul>
