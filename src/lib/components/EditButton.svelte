<script lang="ts">
	import { PenOutline } from 'flowbite-svelte-icons';

	/**
	 * The small pen that opens an edit sheet. It sits inline at the end of the text it
	 * edits (a name or a description), so it follows the last line of that text.
	 */
	let {
		label,
		onclick,
		class: className = ''
	}: { label: string; onclick: () => void; class?: string } = $props();
</script>

<!-- The 40 px tap area overhangs the line (negative margins) so it doesn't push lines apart. -->
<button
	type="button"
	class="-my-2 ms-0.5 inline-flex h-10 w-9 items-center justify-center rounded-lg align-middle text-gray-400 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:text-gray-500 dark:hover:text-primary-400 dark:focus-visible:ring-primary-800 {className}"
	aria-label={label}
	title={label}
	{onclick}
>
	<PenOutline class="h-5 w-5" />
</button>
