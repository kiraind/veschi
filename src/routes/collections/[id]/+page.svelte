<script lang="ts">
	import CollectionPage from './CollectionPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses the page between collections: a fresh component per collection drops open sheets and their state. -->
{#key data.card.collection.id}
	<CollectionPage {data} />
{/key}
