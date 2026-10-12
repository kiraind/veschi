<script lang="ts">
	import HistoryLink from '$lib/components/HistoryLink.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { Badge, Button } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import ParamDefFields from '$lib/components/ParamDefFields.svelte';
	import { isLink, type LinkKind, type ParamValueType } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const def = $derived(data.card.def);
	const used = $derived(def.typeCount + def.itemCount > 0);

	// The form is filled from the page data once (and again after saving).
	// svelte-ignore state_referenced_locally
	let name = $state(data.card.def.name);
	// svelte-ignore state_referenced_locally
	let valueType = $state<ParamValueType>(data.card.def.valueType);
	// svelte-ignore state_referenced_locally
	let unit = $state(data.card.def.unit ?? '');
	// svelte-ignore state_referenced_locally
	let multiple = $state(data.card.def.multiple);
	// svelte-ignore state_referenced_locally
	let options = $state(data.card.def.options.map((o) => ({ ...o })));
	// svelte-ignore state_referenced_locally
	let holder = $state<LinkKind>(data.card.def.holder ?? 'ITEM');
	// svelte-ignore state_referenced_locally
	let inverseName = $state(data.card.def.inverse?.name ?? '');
	const link = $derived(isLink(def.valueType));
	const symmetric = $derived(def.inverse?.id === def.id);
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
			error = errorText(e);
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
				unit,
				multiple,
				// A new option left empty (Enter adds one) is not an option.
				options: options
					.filter((o) => o.id || o.label.trim())
					.map(({ id, label }) => ({ id, label })),
				holder,
				// A symmetric link is renamed both ways at once.
				inverseName: symmetric ? name : inverseName
			});
			await invalidateAll();
			// New options got ids and usage counts.
			options = data.card.def.options.map((o) => ({ ...o }));
			saved = true;
		});
	}

	async function remove() {
		if (!(await confirmAction({ title: `Удалить параметр «${def.name}»?` }))) return;
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
	<ParamDefFields
		bind:name
		bind:valueType
		bind:unit
		bind:multiple
		bind:options
		bind:holder
		bind:inverseName
		typeLocked={used || link}
		holderLocked
		noLinks={!link}
	/>
	{#if link && def.inverse}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{#if symmetric}
				Симметричная связь: одно название в обе стороны.
			{:else}
				Обратная связь —
				<a
					class="text-primary-700 hover:underline dark:text-primary-400"
					href="/params/{def.inverse.id}">«{def.inverse.name}»</a
				>.
			{/if}
		</p>
	{:else if used}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Тип значения можно поменять, только пока параметр нигде не задан. Вариант, который выбран у
			вещей или типов, удалить нельзя.
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
				<Badge
					color="gray"
					large
					href="/types/{type.id}"
					class="dark:bg-gray-700 dark:text-gray-200 py-1.5 break-words">тип · {type.name}</Badge
				>
			</li>
		{/each}
		{#each data.card.items as item (item.id)}
			<li>
				<Badge
					color="gray"
					large
					href="/items/{item.id}"
					class="dark:bg-gray-700 dark:text-gray-200 py-1.5 break-words"
					>{item.name}{item.archived ? ' (в архиве)' : ''}</Badge
				>
			</li>
		{/each}
	</ul>
{/if}

<div class="mt-6"><HistoryLink id={def.id} /></div>
