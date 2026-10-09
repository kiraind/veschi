<script lang="ts">
	import { pathNodeName } from '$lib/domain/item';

	/** Container path as links: «Шкаф → Полка 2 → Коробка». */
	let {
		path,
		emptyText = 'Верхний уровень'
	}: { path: { id: string; name: string; isWorkbench: boolean }[]; emptyText?: string } = $props();
</script>

<span class="trail">
	{#each path as node, i (node.id)}
		{#if i > 0}<span class="sep" aria-hidden="true">→</span>{/if}
		<a href={node.isWorkbench ? '/workbench' : `/items/${node.id}`}>{pathNodeName(node)}</a>
	{:else}
		<span class="muted">{emptyText}</span>
	{/each}
</span>

<style>
	.trail {
		overflow-wrap: anywhere;
	}
	.sep {
		color: var(--muted);
		margin: 0 0.25rem;
	}
</style>
