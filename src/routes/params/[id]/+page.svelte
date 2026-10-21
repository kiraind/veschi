<script lang="ts">
	import ParamPage from './ParamPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses the page between parameters: a fresh component per parameter drops open sheets and their state. -->
{#key data.card.def.id}
	<ParamPage {data} />
{/key}
