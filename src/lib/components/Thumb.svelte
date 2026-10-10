<script lang="ts">
	import { ImageOutline } from 'flowbite-svelte-icons';

	/** Square thumbnail of an item or type photo, or a placeholder. */
	let { photoKey, size = 48 }: { photoKey: string | null; size?: number } = $props();
</script>

{#if photoKey}
	<img
		class="flex-none rounded-lg bg-gray-200 object-cover dark:bg-gray-700"
		src="/files/{photoKey}"
		alt=""
		width={size}
		height={size}
		style:width="{size}px"
		style:height="{size}px"
		loading="lazy"
	/>
{:else}
	<span
		class="inline-flex flex-none items-center justify-center rounded-lg bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600"
		style:width="{size}px"
		style:height="{size}px"
		aria-hidden="true"
	>
		<ImageOutline width={size / 2} height={size / 2} />
	</span>
{/if}
