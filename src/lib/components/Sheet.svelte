<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Drawer } from 'flowbite-svelte';
	import { CloseOutline } from 'flowbite-svelte-icons';

	/** A bottom sheet («шторка») with a title and a close button. */
	let {
		open = $bindable(false),
		title,
		children
	}: { open?: boolean; title: string; children: Snippet } = $props();
</script>

<Drawer
	bind:open
	placement="bottom"
	class="mx-auto max-w-2xl rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
	dismissable={false}
>
	<div class="mb-3 flex items-center justify-between gap-2">
		<h2 class="text-lg font-semibold wrap-anywhere">{title}</h2>
		<button
			type="button"
			class="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
			aria-label="Закрыть"
			onclick={() => (open = false)}
		>
			<CloseOutline class="h-5 w-5" />
		</button>
	</div>
	{#if open}{@render children()}{/if}
</Drawer>
