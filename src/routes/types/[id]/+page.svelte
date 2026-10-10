<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import ParamList from '$lib/components/ParamList.svelte';
	import PathTrail from '$lib/components/PathTrail.svelte';
	import TypePhotoUpload from '$lib/components/TypePhotoUpload.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const type = $derived(data.card.type);
	const total = $derived(data.card.items.reduce((sum, i) => sum + i.quantity, 0));
	let error = $state('');

	async function remove() {
		if (!confirm(`Удалить тип «${type.name}»?`)) return;
		error = '';
		try {
			await api.delete(`/api/types/${type.id}`);
			await goto('/types');
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		}
	}
</script>

<svelte:head><title>{type.name} — Вещи</title></svelte:head>

<p class="mb-2">
	<a
		class="inline-flex items-center gap-1 py-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
		href="/types"><ArrowLeftOutline class="h-4 w-4" />Типы</a
	>
</p>
<h1 class="mb-3 text-2xl font-bold break-words">{type.name}</h1>

<TypePhotoUpload typeId={type.id} photoKey={type.photoKey} />

<h2 class="mt-6 mb-2 text-lg font-semibold">Параметры</h2>
<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">Общие для всех вещей этого типа.</p>
<ParamList params={data.card.params} />

<div class="mt-4 flex flex-wrap gap-2">
	<Button color="alternative" href="/types/{type.id}/edit">Изменить</Button>
	<Button color="alternative" href="/items/new?type={type.id}">
		<PlusOutline class="me-1 h-4 w-4" />Вещь этого типа
	</Button>
</div>

<h2 class="mt-6 mb-2 text-lg font-semibold">
	Где лежит{#if total > 0}: всего {total} шт.{/if}
</h2>
{#if data.card.items.length === 0}
	<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">Вещей этого типа нет.</p>
	<Button color="red" outline onclick={remove}>Удалить тип</Button>
{:else}
	<ul class="flex flex-col gap-2">
		{#each data.card.items as item (item.id)}
			<li class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words">
				<PathTrail path={item.path} emptyText="верхний уровень" />
				<Badge color="gray" large href="/items/{item.id}" class="py-1.5 break-words">
					{item.name} · {item.quantity} шт.
				</Badge>
			</li>
		{/each}
	</ul>
{/if}
{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
