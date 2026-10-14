<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { formatCode } from '$lib/domain/sticker-code';
	import { confirmAction } from '$lib/confirm.svelte';

	/**
	 * The item's bound sticker with «Отвязать». Without one the card has
	 * «+ Наклейка» or «Наклейка N мм ждёт печати», both opening StickerSheet.
	 */
	let {
		itemId,
		sticker,
		editable
	}: {
		itemId: string;
		sticker: { code: string };
		/** False for archived items: their sticker is only shown. */
		editable: boolean;
	} = $props();

	let busy = $state(false);
	let error = $state('');

	async function unbind() {
		const ok = await confirmAction({
			title: 'Отвязать наклейку?',
			message: 'Она будет списана, к вещи можно будет привязать новую.',
			confirmLabel: 'Отвязать'
		});
		if (!ok) return;
		busy = true;
		error = '';
		try {
			await api.post('/api/stickers/unbind', { itemId });
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<span>Наклейка <strong class="font-mono">{formatCode(sticker.code)}</strong></span>
		{#if editable}
			<Button
				size="sm"
				class="h-10"
				color="alternative"
				type="button"
				onclick={unbind}
				disabled={busy}
			>
				Отвязать наклейку
			</Button>
		{/if}
	</div>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
