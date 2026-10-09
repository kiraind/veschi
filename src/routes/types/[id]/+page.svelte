<script lang="ts">
	import { goto } from '$app/navigation';
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

<p><a href="/types">← Типы</a></p>
<h1>{type.name}</h1>

<TypePhotoUpload typeId={type.id} photoKey={type.photoKey} />

<h2>Параметры</h2>
<p class="muted">Общие для всех вещей этого типа.</p>
<ParamList params={data.card.params} />

<div class="row actions">
	<a class="button" href="/types/{type.id}/edit">Изменить</a>
	<a class="button" href="/items/new?type={type.id}">+ Вещь этого типа</a>
</div>

<h2>
	Где лежит{#if total > 0}: всего {total} шт.{/if}
</h2>
{#if data.card.items.length === 0}
	<p class="muted">Вещей этого типа нет.</p>
	<button class="danger" onclick={remove}>Удалить тип</button>
{:else}
	<ul class="list">
		{#each data.card.items as item (item.id)}
			<li>
				<PathTrail path={item.path} emptyText="верхний уровень" />
				<a class="badge" href="/items/{item.id}">{item.name} · {item.quantity} шт.</a>
			</li>
		{/each}
	</ul>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
	.actions {
		margin-top: 1rem;
	}
	.badge {
		margin-left: 0.25rem;
		text-decoration: none;
	}
</style>
