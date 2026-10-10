<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Badge, Button, Card, Checkbox, Input, Label } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import OptionListEditor from '$lib/components/OptionListEditor.svelte';
	import ParamDefPicker from '$lib/components/ParamDefPicker.svelte';
	import { PARAM_VALUE_TYPE_LABELS, type ParamDefView } from '$lib/domain/params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let addingParam = $state(false);
	let filter = $state('');
	const shown = $derived(
		data.defs.filter((d) =>
			d.name.toLocaleLowerCase('ru').includes(filter.trim().toLocaleLowerCase('ru'))
		)
	);

	let creatingList = $state(false);
	let name = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	let busy = $state(false);
	let error = $state('');

	function usage(d: ParamDefView): string {
		const parts = [];
		if (d.typeCount) parts.push(`типов: ${d.typeCount}`);
		if (d.itemCount) parts.push(`вещей: ${d.itemCount}`);
		return parts.length ? parts.join(', ') : 'нигде не задан';
	}

	async function createList(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.post('/api/dictionaries', { name, multiple, options });
			name = '';
			multiple = false;
			options = [];
			creatingList = false;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Параметры — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Параметры</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Параметры, которые можно задать типам и вещам: «Корпус», «Напряжение», «Гарантия до». Значения
	задаются на странице типа или вещи.
</p>

{#if data.defs.length > 8}
	<Input
		class="mb-3"
		type="search"
		bind:value={filter}
		placeholder="Найти параметр"
		aria-label="Найти параметр"
	/>
{/if}

<ul
	class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
>
	{#each shown as d (d.id)}
		<li>
			<a
				href="/params/{d.id}"
				class="flex min-h-12 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
			>
				<span class="min-w-0 font-medium break-words">{d.name}</span>
				<span class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
					<Badge color="gray"
						>{d.valueType === 'ENUM'
							? `список «${d.dictionaryName}»`
							: PARAM_VALUE_TYPE_LABELS[d.valueType]}</Badge
					>
					{usage(d)}
				</span>
			</a>
		</li>
	{:else}
		<li class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
			{data.defs.length ? 'Ничего не найдено.' : 'Параметров пока нет.'}
		</li>
	{/each}
</ul>

<div class="mt-3">
	{#if addingParam}
		<ParamDefPicker
			exclude={data.defs.map((d) => d.id)}
			onpick={(def) => goto(`/params/${def.id}`)}
			oncancel={() => (addingParam = false)}
		/>
	{:else}
		<Button color="alternative" onclick={() => (addingParam = true)}>
			<PlusOutline class="me-1 h-4 w-4" />Новый параметр
		</Button>
	{/if}
</div>

<h2 id="lists" class="mt-8 mb-2 scroll-mt-20 text-lg font-semibold">Выпадающие списки</h2>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Варианты для параметров с выбором из списка: например, «Состояние» — новое / б/у / сломано. Один
	список можно использовать в нескольких параметрах.
</p>

<ul class="flex flex-col gap-2">
	{#each data.dictionaries as d (d.id)}
		<li>
			<Card class="max-w-none gap-1 p-4">
				<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<a
						class="min-w-0 font-semibold break-words text-primary-700 hover:underline dark:text-primary-400"
						href="/params/lists/{d.id}">{d.name}</a
					>
					<span class="text-sm text-gray-500 dark:text-gray-400"
						>{d.multiple ? 'несколько вариантов' : 'один вариант'}</span
					>
				</div>
				<div class="text-sm break-words text-gray-500 dark:text-gray-400">
					{d.options.map((o) => o.label).join(' / ') || 'нет вариантов'}
				</div>
			</Card>
		</li>
	{:else}
		<li class="text-sm text-gray-500 dark:text-gray-400">Выпадающих списков пока нет.</li>
	{/each}
</ul>

{#if creatingList}
	<Card class="mt-4 max-w-none p-4">
		<form class="flex flex-col gap-3" onsubmit={createList}>
			<Label>
				Название
				<Input class="mt-1" bind:value={name} placeholder="Например, Состояние" required />
			</Label>
			<Checkbox bind:checked={multiple}>Можно выбрать несколько вариантов</Checkbox>
			<span class="text-sm text-gray-500 dark:text-gray-400">Варианты</span>
			<OptionListEditor bind:options />
			{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy}>Создать</Button>
				<Button color="alternative" type="button" onclick={() => (creatingList = false)}
					>Отмена</Button
				>
			</div>
		</form>
	</Card>
{:else}
	<Button class="mt-4" color="alternative" onclick={() => (creatingList = true)}>
		<PlusOutline class="me-1 h-4 w-4" />Новый список
	</Button>
{/if}
