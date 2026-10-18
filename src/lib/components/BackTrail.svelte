<script lang="ts">
	import { ArrowLeftOutline } from 'flowbite-svelte-icons';
	import { tabs } from '$lib/tabs.svelte';

	/**
	 * Breadcrumbs of where the user came from in this tab: «← Поиск › Коробка». A crumb goes
	 * back to that page, like Back. Without a trail (the page opened by a QR link, or on the
	 * server) shows `fallback`, the section the page belongs to.
	 */
	let { fallback }: { fallback?: { href: string; title: string } } = $props();

	/** Only the last pages: older ones are a Back or a tab tap away. */
	const MAX = 3;

	const trail = $derived(tabs.trail().slice(-MAX));
	const linkClass = 'text-primary-700 hover:underline dark:text-primary-400';
</script>

{#if trail.length > 0 || fallback}
	<nav aria-label="Откуда вы пришли" class="mb-2 py-2 text-sm wrap-anywhere">
		<ArrowLeftOutline
			class="me-1 inline h-4 w-4 align-[-0.15em] text-primary-700 dark:text-primary-400"
		/>
		{#if trail.length > 0}
			{#each trail as entry, i (entry.path)}
				{#if i > 0}<span class="mx-1 text-gray-400 dark:text-gray-500" aria-hidden="true">›</span
					>{/if}
				<a
					href={entry.href}
					class={linkClass}
					onclick={(e) => {
						if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
						e.preventDefault();
						tabs.back(entry);
					}}>{entry.title || 'Назад'}</a
				>
			{/each}
		{:else if fallback}
			<a href={fallback.href} class={linkClass}>{fallback.title}</a>
		{/if}
	</nav>
{/if}
