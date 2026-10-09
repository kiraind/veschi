<script lang="ts">
	import ItemContents from '$lib/components/ItemContents.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Вещи</title></svelte:head>

<div class="row heading">
	<h1>Вещи</h1>
	<a class="button primary" href="/items/new">Новая вещь</a>
</div>
<p class="muted">Верхний уровень: шкафы, ящики и вещи, которые ни во что не положены.</p>

{#if data.items.length === 0}
	<p class="muted">Пока пусто.</p>
{:else}
	<ItemContents entries={data.items} />
{/if}

<style>
	.heading {
		justify-content: space-between;
	}
</style>
