<script lang="ts">
	import { pieces } from '$lib/domain/plural';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { formatCode } from '$lib/domain/sticker-code';
	import QrScanner from './QrScanner.svelte';
	import { DEFAULT_STICKER_WIDTH, type StickerWidth } from '$lib/domain/sticker-sheet';
	import { confirmAction } from '$lib/confirm.svelte';

	/**
	 * The item's bound sticker with «Отвязать», or its sticker waiting for print
	 * with «Привязать» / «Не печатать». Without either the card has only
	 * «+ Наклейка» (StickerSheet).
	 */
	let {
		itemId,
		quantity = 1,
		sticker,
		orderWidth = DEFAULT_STICKER_WIDTH,
		editable
	}: {
		itemId: string;
		/** A sticker marks one thing: binding it to several splits one off (see bindSticker). */
		quantity?: number;
		sticker: {
			code: string;
			status: 'FREE' | 'BOUND' | 'WRITTEN_OFF';
			caption: string | null;
		} | null;
		/** Width of the sticker waiting for print (shown when there is no bound sticker). */
		orderWidth?: StickerWidth;
		/** False for archived items: their sticker is only shown. */
		editable: boolean;
	} = $props();

	let binding = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			binding = false;
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	const bind = (code: string) =>
		run(async () => {
			const bound = await api.post<{ itemId: string }>('/api/stickers/bind', { code, itemId });
			if (bound.itemId !== itemId) await goto(`/items/${bound.itemId}`);
		});

	const cancelOrder = () => run(() => api.delete(`/api/stickers/orders/${itemId}`));

	async function unbind() {
		const ok = await confirmAction({
			title: 'Отвязать наклейку?',
			message: 'Она будет списана, к вещи можно будет привязать новую.',
			confirmLabel: 'Отвязать'
		});
		if (ok) run(() => api.post('/api/stickers/unbind', { itemId }));
	}
</script>

<div class="flex flex-col gap-2">
	{#if sticker?.status === 'BOUND'}
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
	{:else}
		<a href="/stickers" class="text-sm text-primary-700 hover:underline dark:text-primary-500"
			>Наклейка {orderWidth} мм ждёт печати</a
		>
		{#if editable}
			<div class="flex flex-wrap gap-2">
				<Button
					size="sm"
					class="h-10"
					color="alternative"
					type="button"
					onclick={() => (binding = !binding)}
					disabled={busy}
				>
					{binding ? 'Отмена' : 'Привязать'}
				</Button>
				{#if !binding}
					<Button
						size="sm"
						class="h-10"
						color="alternative"
						type="button"
						onclick={cancelOrder}
						disabled={busy}
					>
						Не печатать
					</Button>
				{/if}
			</div>
		{/if}
		{#if binding}
			{#if quantity > 1}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Наклейка обозначает одну вещь: из {pieces(quantity)} одна станет отдельной записью с наклейкой,
					остальные останутся здесь.
				</p>
			{/if}
			<QrScanner onscan={bind} active={binding} />
		{/if}
	{/if}
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
