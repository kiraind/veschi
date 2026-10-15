<script lang="ts">
	import { Alert } from 'flowbite-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * A warning or an error box. Flowbite's own yellow and red alerts stay light
	 * in the dark theme (dark:bg-yellow-200) and have pale text in the light one;
	 * these colours are readable in both.
	 */
	let {
		tone,
		class: className = '',
		children
	}: { tone: 'warning' | 'danger'; class?: string; children: Snippet } = $props();

	const tones = {
		warning:
			'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-gray-800 dark:text-amber-300',
		danger:
			'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-gray-800 dark:text-red-400'
	};
</script>

<Alert color={tone === 'warning' ? 'yellow' : 'red'} class="{tones[tone]} {className}">
	{@render children()}
</Alert>
