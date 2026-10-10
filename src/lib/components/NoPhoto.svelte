<script lang="ts">
	import { ImageOutline } from 'flowbite-svelte-icons';
	import BoxIcon from './icons/BoxIcon.svelte';

	/** What stands in for a missing photo: a box for containers, a picture for other things. */
	let { container = false, class: className = '' }: { container?: boolean; class?: string } =
		$props();
</script>

{#if container}
	<BoxIcon class="{className} stroke-[1.5]" />
{:else}
	<ImageOutline class={className} />
{/if}
