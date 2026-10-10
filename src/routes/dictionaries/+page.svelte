<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Card, Checkbox, Input, Label } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import OptionListEditor from '$lib/components/OptionListEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let name = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	let busy = $state(false);
	let error = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.post('/api/dictionaries', { name, multiple, options });
			name = '';
			multiple = false;
			options = [];
			creating = false;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Справочники — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Справочники</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Списки вариантов для параметров «из справочника»: например, «Состояние» — новое / б/у / сломано.
	Один справочник используется в параметрах любых типов и вещей.
</p>

<ul class="flex flex-col gap-2">
	{#each data.dictionaries as d (d.id)}
		<li>
			<Card class="max-w-none gap-1 p-4">
				<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<a
						class="min-w-0 font-semibold break-words text-primary-700 hover:underline dark:text-primary-400"
						href="/dictionaries/{d.id}">{d.name}</a
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
		<li class="text-sm text-gray-500 dark:text-gray-400">Справочников пока нет.</li>
	{/each}
</ul>

{#if creating}
	<Card class="mt-4 max-w-none p-4">
		<form class="flex flex-col gap-3" onsubmit={create}>
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
				<Button color="alternative" type="button" onclick={() => (creating = false)}>Отмена</Button>
			</div>
		</form>
	</Card>
{:else}
	<Button class="mt-4" color="alternative" onclick={() => (creating = true)}>
		<PlusOutline class="me-1 h-4 w-4" />Новый справочник
	</Button>
{/if}
