<script lang="ts">
	import { PenOutline } from 'flowbite-svelte-icons';

	/** The small pen next to a name or a description that opens its edit sheet. */
	let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button
	type="button"
	class="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:ring-4 focus:ring-gray-200 focus:outline-none dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-gray-700"
	aria-label={label}
	title={label}
	{onclick}
>
	<PenOutline class="h-5 w-5" />
</button>
