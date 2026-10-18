<script lang="ts">
	import BarcodePage from './BarcodePage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses the page between barcodes: a fresh component per barcode drops open sheets and their state. -->
{#key data.input}
	<BarcodePage {data} />
{/key}
