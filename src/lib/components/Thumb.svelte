<script lang="ts">
	/** Square thumbnail of a type photo, or an empty placeholder. */
	let { photoKey, size = 48 }: { photoKey: string | null; size?: number } = $props();
</script>

{#if photoKey}
	<img class="thumb" src="/files/{photoKey}" alt="" width={size} height={size} loading="lazy" />
{:else}
	<span class="thumb empty" style:width="{size}px" style:height="{size}px" aria-hidden="true"
	></span>
{/if}

<style>
	.thumb {
		flex: none;
		object-fit: cover;
		border-radius: 8px;
		background: var(--border);
	}
	.empty {
		display: inline-block;
	}
</style>
