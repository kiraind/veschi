<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { ArrowLeftOutline, PrinterOutline, QrCodeOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { piecesGenitive } from '$lib/domain/plural';
	import { formatCode } from '$lib/domain/sticker-code';
	import { STICKER_WIDTHS, type StickerWidth } from '$lib/domain/sticker-sheet';
	import QrScanner from './QrScanner.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «+ Наклейка» on the card of an item without a sticker: bind a free sticker
	 * by scanning it, or print one of the chosen width with the next batch.
	 * For a sticker waiting for print it binds one instead or changes the width.
	 * With a bound sticker it shows the sticker and unbinds it.
	 */
	let {
		open = $bindable(false),
		itemId,
		quantity = 1,
		ordered = null,
		bound = null
	}: {
		open?: boolean;
		itemId: string;
		/** Width of the sticker waiting for print, if there is one. */
		ordered?: StickerWidth | null;
		/** Code of the sticker bound to the item, if there is one. */
		bound?: string | null;
		/** A sticker marks one thing: binding it to several splits one off (see bindSticker). */
		quantity?: number;
	} = $props();

	let step = $state<'choose' | 'bind' | 'print'>('choose');
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open) {
			step = 'choose';
			error = '';
		}
	});

	const WIDTH_HINTS: Record<StickerWidth, string> = {
		10: 'Для мелочей',
		20: 'Обычная',
		40: 'Крупная, читается издалека'
	};

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			open = false;
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

	const unbind = () => run(() => api.post('/api/stickers/unbind', { itemId }));

	const order = (width: StickerWidth) =>
		run(() => api.post('/api/stickers/orders', { itemId, width }));

	const optionClass =
		'flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none disabled:opacity-50 dark:hover:bg-gray-700 dark:focus:bg-gray-700';
	const iconClass = 'h-6 w-6 flex-none text-gray-500 dark:text-gray-400';
	const hintClass = 'block text-sm text-gray-500 dark:text-gray-400';
</script>

<Sheet
	bind:open
	title={bound ? `Наклейка ${formatCode(bound)}` : step === 'print' ? 'Какой ширины?' : 'Наклейка'}
>
	{#if !bound && step !== 'choose'}
		<button
			type="button"
			class="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
			onclick={() => {
				step = 'choose';
				error = '';
			}}
		>
			<ArrowLeftOutline class="h-4 w-4" />Назад
		</button>
	{/if}

	{#if bound}
		<div class="flex flex-col gap-4">
			<p class="text-gray-500 dark:text-gray-400">
				Наклейка привязана к этой вещи. Если она потерялась или испортилась, отвяжите её: она будет
				списана, а к вещи можно будет привязать новую.
			</p>
			<Button color="red" outline class="h-11 self-start" onclick={unbind} disabled={busy}
				>Отвязать наклейку</Button
			>
		</div>
	{:else if step === 'choose'}
		<div class="flex flex-col gap-1">
			<button type="button" class={optionClass} onclick={() => (step = 'bind')}>
				<QrCodeOutline class={iconClass} />
				<span>
					<span class="block font-medium">Привязать</span>
					<span class={hintClass}>Отсканировать свободную наклейку</span>
				</span>
			</button>
			<button type="button" class={optionClass} onclick={() => (step = 'print')}>
				<PrinterOutline class={iconClass} />
				<span>
					{#if ordered}
						<span class="block font-medium">Другая ширина</span>
						<span class={hintClass}>Сейчас {ordered} мм</span>
					{:else}
						<span class="block font-medium">Напечатать</span>
						<span class={hintClass}>С названием вещи, на странице «Наклейки»</span>
					{/if}
				</span>
			</button>
		</div>
	{:else if step === 'bind'}
		{#if quantity > 1}
			<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
				Наклейка обозначает одну вещь: из {piecesGenitive(quantity)} одна станет отдельной записью с наклейкой,
				остальные останутся здесь.
			</p>
		{/if}
		<QrScanner onscan={bind} active={open && step === 'bind'} submitLabel="Привязать" />
	{:else}
		<div class="flex flex-col gap-1">
			{#each STICKER_WIDTHS as width (width)}
				<button type="button" class={optionClass} disabled={busy} onclick={() => order(width)}>
					<span class="w-14 flex-none font-medium">{width} мм</span>
					<span class={hintClass}>{WIDTH_HINTS[width]}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</Sheet>
