<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Badge, Button, Input, Label, Select } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import {
		PARAM_VALUE_TYPES,
		PARAM_VALUE_TYPE_LABELS,
		type ParamValueType
	} from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const def = $derived(data.card.def);
	const used = $derived(def.typeCount + def.itemCount > 0);

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	let name = $state(data.card.def.name);
	// svelte-ignore state_referenced_locally
	let valueType = $state<ParamValueType>(data.card.def.valueType);
	// svelte-ignore state_referenced_locally
	let dictionaryId = $state(data.card.def.dictionaryId ?? '');
	let busy = $state(false);
	let error = $state('');
	let saved = $state(false);

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		saved = false;
		try {
			await action();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		run(async () => {
			await api.put(`/api/param-defs/${def.id}`, {
				name,
				valueType,
				dictionaryId: valueType === 'ENUM' ? dictionaryId || null : null
			});
			await invalidateAll();
			saved = true;
		});
	}

	function remove() {
		if (!confirm(`Удалить параметр «${def.name}»?`)) return;
		run(async () => {
			await api.delete(`/api/param-defs/${def.id}`);
			await goto('/params');
		});
	}
</script>

<svelte:head><title>{def.name} — Параметры</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/params"><ArrowLeftOutline class="h-4 w-4" />Параметры</a
	>
</p>
<h1 class="mb-3 text-2xl font-bold break-words">{def.name}</h1>

<form class="flex flex-col gap-3" onsubmit={save}>
	<Label>
		Название
		<Input class="mt-1" bind:value={name} required />
	</Label>
	<Label>
		Тип значения
		<Select class="mt-1" bind:value={valueType} placeholder="" disabled={used}>
			{#each PARAM_VALUE_TYPES as type (type)}
				<option value={type}>{PARAM_VALUE_TYPE_LABELS[type]}</option>
			{/each}
		</Select>
	</Label>
	{#if valueType === 'ENUM'}
		<Label>
			Выпадающий список
			<Select class="mt-1" bind:value={dictionaryId} placeholder="" disabled={used} required>
				<option value="" disabled>Выберите список…</option>
				{#each data.dictionaries as d (d.id)}
					<option value={d.id}>{d.name}</option>
				{/each}
			</Select>
		</Label>
		{#if def.dictionaryId}
			<p class="text-sm">
				<a
					class="text-primary-700 hover:underline dark:text-primary-400"
					href="/params/lists/{def.dictionaryId}">Изменить варианты списка «{def.dictionaryName}»</a
				>
			</p>
		{/if}
	{/if}
	{#if used}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Тип значения и список можно поменять, только пока параметр нигде не задан.
		</p>
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap items-center gap-2">
		<Button type="submit" disabled={busy}>Сохранить</Button>
		{#if saved}<span class="text-sm text-gray-500 dark:text-gray-400">Сохранено</span>{/if}
	</div>
</form>

<h2 class="mt-6 mb-2 text-lg font-semibold">Где задан</h2>
{#if !used}
	<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
		Пока нигде. Значение задаётся на странице типа или вещи.
	</p>
	<Button color="red" outline onclick={remove} disabled={busy}>Удалить параметр</Button>
{:else}
	<ul class="flex flex-wrap gap-2">
		{#each data.card.types as type (type.id)}
			<li>
				<Badge color="gray" large href="/types/{type.id}" class="py-1.5 break-words"
					>тип · {type.name}</Badge
				>
			</li>
		{/each}
		{#each data.card.items as item (item.id)}
			<li>
				<Badge color="gray" large href="/items/{item.id}" class="py-1.5 break-words"
					>{item.name}{item.archived ? ' (в архиве)' : ''}</Badge
				>
			</li>
		{/each}
	</ul>
{/if}
