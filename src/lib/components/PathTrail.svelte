<script lang="ts">
	import { pathNodeName } from '$lib/domain/item';

	/** Container path as links: «Шкаф → Полка 2 → Коробка». */
	let {
		path,
		emptyText = 'Верхний уровень'
	}: { path: { id: string; name: string; isWorkbench: boolean }[]; emptyText?: string } = $props();
</script>

<span class="wrap-anywhere">
	{#each path as node, i (node.id)}
		{#if i > 0}<span class="mx-1 text-gray-400 dark:text-gray-500" aria-hidden="true">→</span>{/if}
		<a href={node.isWorkbench ? '/workbench' : `/items/${node.id}`}>{pathNodeName(node)}</a>
	{:else}
		<span class="text-gray-500 dark:text-gray-400">{emptyText}</span>
	{/each}
</span>
