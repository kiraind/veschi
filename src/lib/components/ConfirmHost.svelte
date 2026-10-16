<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, CloseButton, Modal } from 'flowbite-svelte';
	import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { confirmState } from '$lib/confirm.svelte';

	/** The dialog behind `confirmAction` (src/lib/confirm.svelte.ts); rendered once in the layout. */
	const pending = $derived(confirmState.current);

	// Open while a question is pending; the dialog closes itself on Escape or a click outside.
	let open = $derived(pending !== null);
	// Escape or a click outside closes the dialog: that is «Отмена».
	$effect(() => {
		if (!open) untrack(() => confirmState.current)?.resolve(false);
	});
</script>

<!-- Our own cross: Flowbite's one is labelled «Close» for screen readers. -->
<Modal bind:open size="xs" dismissable={false} classes={{ body: 'flex flex-col gap-4 p-4 md:p-5' }}>
	{#if pending}
		<div class="flex items-start gap-3">
			{#if pending.danger}
				<ExclamationCircleOutline class="mt-0.5 h-6 w-6 shrink-0 text-red-600 dark:text-red-500" />
			{/if}
			<div class="min-w-0 space-y-1 pe-8">
				<h3 class="text-lg font-semibold break-words text-gray-900 dark:text-white">
					{pending.title}
				</h3>
				{#if pending.message}
					<p class="text-sm break-words text-gray-500 dark:text-gray-400">{pending.message}</p>
				{/if}
			</div>
		</div>
		<div class="flex flex-wrap justify-end gap-2">
			{#if pending.cancelLabel}
				<Button color="alternative" onclick={() => pending.resolve(false)}>
					{pending.cancelLabel}
				</Button>
			{/if}
			<Button color={pending.danger ? 'red' : 'primary'} onclick={() => pending.resolve(true)}>
				{pending.confirmLabel}
			</Button>
		</div>
		<!-- Last, so the dialog still puts the focus on the first answer button. -->
		<CloseButton name="Закрыть" class="absolute end-2.5 top-2.5" />
	{/if}
</Modal>
