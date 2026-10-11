<script lang="ts">
	import ItemPage from './ItemPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses the page between items: a fresh component per item drops open sheets and their state. -->
{#key data.card.item.id}
	<ItemPage {data} />
{/key}
