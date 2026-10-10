<script lang="ts">
	import NoPhoto from './NoPhoto.svelte';

	/** Square thumbnail of an item or type photo, or a placeholder (a box for containers). */
	let {
		photoKey,
		size = 48,
		container = false
	}: { photoKey: string | null; size?: number; container?: boolean } = $props();
</script>

{#if photoKey}
	<img
		class="flex-none rounded-lg bg-gray-200 object-cover dark:bg-gray-700"
		src="/files/{photoKey}?size=thumb"
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
		<span style:width="{size / 2}px" style:height="{size / 2}px" class="inline-flex">
			<NoPhoto {container} class="h-full w-full" />
		</span>
	</span>
{/if}
