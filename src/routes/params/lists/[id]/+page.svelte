<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Checkbox, Input, Label } from 'flowbite-svelte';
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import OptionListEditor from '$lib/components/OptionListEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The form is filled from the page data once.
	// svelte-ignore state_referenced_locally
	const { dictionary } = data;
	let name = $state(dictionary.name);
	let multiple = $state(dictionary.multiple);
	let options = $state(dictionary.options.map((o) => ({ ...o })));
	let busy = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>, next: string) {
		busy = true;
		error = '';
		try {
			await action();
			await goto(next);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const body = { name, multiple, options: options.map(({ id, label }) => ({ id, label })) };
		run(() => api.put(`/api/dictionaries/${dictionary.id}`, body), '/params#lists');
	}

	function remove() {
		if (!confirm(`Удалить список «${dictionary.name}»?`)) return;
		run(() => api.delete(`/api/dictionaries/${dictionary.id}`), '/params#lists');
	}
</script>

<svelte:head><title>{dictionary.name} — Выпадающие списки</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/params#lists"><ArrowLeftOutline class="h-4 w-4" />Параметры</a
	>
</p>
<h1 class="mb-3 text-2xl font-bold break-words">{dictionary.name}</h1>

<form class="flex flex-col gap-3" onsubmit={save}>
	<Label>
		Название
		<Input class="mt-1" bind:value={name} required />
	</Label>
	<Checkbox bind:checked={multiple}>Можно выбрать несколько вариантов</Checkbox>
	<span class="text-sm text-gray-500 dark:text-gray-400">
		Варианты. Переименование видно сразу во всех параметрах; используемый вариант удалить нельзя.
	</span>
	<OptionListEditor bind:options />
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy}>Сохранить</Button>
		<Button color="alternative" href="/params#lists">Отмена</Button>
	</div>
</form>

<div class="mt-8">
	{#if dictionary.usage > 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Используется в параметрах: {dictionary.usage}. Удалить нельзя.
		</p>
	{:else}
		<Button color="red" outline onclick={remove} disabled={busy}>Удалить список</Button>
	{/if}
</div>
