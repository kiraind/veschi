<script lang="ts">
	import CategoryPage from './CategoryPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses the page between categories: a fresh component per category drops open sheets and their state. -->
{#key data.card.category.id}
	<CategoryPage {data} />
{/key}
