<script lang="ts">
	import type { Snippet } from 'svelte';
	import { InfoCircleOutline } from 'flowbite-svelte-icons';
	import Sheet from './Sheet.svelte';

	/**
	 * An explanation hidden behind an «i» icon: the icon sits inline (next to a
	 * heading), a tap opens the text in a bottom sheet.
	 */
	let { title, children }: { title: string; children: Snippet } = $props();

	let open = $state(false);
</script>

<!-- The 40 px tap area overhangs the line (negative margins), like EditButton. -->
<button
	type="button"
	class="-my-2 ms-0.5 inline-flex h-10 w-9 items-center justify-center rounded-lg align-middle text-gray-400 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:text-gray-500 dark:hover:text-primary-400 dark:focus-visible:ring-primary-800"
	aria-label="Подсказка: {title}"
	title="Подсказка"
	onclick={() => (open = true)}
>
	<InfoCircleOutline class="h-5 w-5" />
</button>

<Sheet bind:open {title}>
	<div class="flex flex-col gap-2 pb-2 text-base font-normal text-gray-700 dark:text-gray-300">
		{@render children()}
	</div>
</Sheet>
