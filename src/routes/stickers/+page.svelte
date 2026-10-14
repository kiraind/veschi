<script lang="ts">
	import { formatIsoDateTime } from '$lib/domain/dates';
	import { invalidateAll } from '$app/navigation';
	import { Alert, Button, Card, Checkbox, Input, Label } from 'flowbite-svelte';
	import { FilePdfOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import StickerWidthSelect from '$lib/components/StickerWidthSelect.svelte';
	import { plural } from '$lib/domain/plural';
	import {
		CAPTION_MAX_LINES,
		DEFAULT_STICKER_WIDTH,
		STICKER_WIDTHS,
		MAX_SHEETS_PER_BATCH,
		type StickerWidth,
		wrapCaption,
		planSheets
	} from '$lib/domain/sticker-sheet';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let blankCounts = $state<Record<StickerWidth, number>>({ 10: 0, 20: 0, 40: 0 });
	let fillSheet = $state(true);
	let fillWidth = $state<StickerWidth>(DEFAULT_STICKER_WIDTH);
	let busy = $state(false);
	let error = $state('');
	let issuedId = $state('');

	// Ordered stickers carry the item's name and the width of the order (see issueBatch).
	const captions = $derived(data.orders.map((o) => ({ caption: o.caption, width: o.width })));
	const count = (n: number) => (Number.isInteger(n) && n > 0 ? n : 0);
	const blanks = $derived({
		10: count(blankCounts[10]),
		20: count(blankCounts[20]),
		40: count(blankCounts[40])
	});
	const fill = $derived(fillSheet ? fillWidth : null);
	const plan = $derived(planSheets(captions, blanks, fill));
	/** Item names that do not fit into the caption of their sticker. */
	const tooLong = $derived(
		captions
			.map(({ caption, width }) => ({ caption, width, fitted: wrapCaption(caption, width) }))
			.filter(({ fitted }) => fitted.truncated)
	);
	const tooMany = $derived(plan.sheets > MAX_SHEETS_PER_BATCH);

	// A leading space: Svelte drops the whitespace between «подписи» and an {#if}.
	const padText = $derived(` (ещё ${plan.padding} добавлено, чтобы заполнить лист)`);
	// «шириной 40 мм» when all are of one width other than 20, «(40 мм: 5, 20 мм: 110)» when mixed.
	const widthText = $derived.by(() => {
		const used = [...STICKER_WIDTHS].reverse().filter((w) => plan.byWidth[w] > 0);
		if (used.length > 1) return ` (${used.map((w) => `${w} мм: ${plan.byWidth[w]}`).join(', ')})`;
		return used[0] && used[0] !== DEFAULT_STICKER_WIDTH ? ` шириной ${used[0]} мм` : '';
	});

	function batchStats(batch: PageData['batches'][number]): string {
		return [
			`${batch.total} ${plural(batch.total, ['наклейка', 'наклейки', 'наклеек'])}, с подписью ${batch.captioned}`,
			batch.ordered > 0 ? `для вещей ${batch.ordered}` : '',
			`свободно ${batch.free}`,
			`привязано ${batch.bound}`,
			batch.writtenOff > 0 ? `списано ${batch.writtenOff}` : ''
		]
			.filter(Boolean)
			.join(' · ');
	}

	const pdfUrl = (id: string) => `/api/stickers/batches/${id}/pdf`;

	function sheetsLabel(n: number): string {
		const mod10 = n % 10;
		const mod100 = n % 100;
		if (mod10 === 1 && mod100 !== 11) return `${n} лист`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} листа`;
		return `${n} листов`;
	}

	async function issue(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const batch = await api.post<{ id: string }>('/api/stickers/batches', {
				blanks,
				fill,
				orderItemIds: data.orders.map((o) => o.itemId)
			});
			issuedId = batch.id;
			blankCounts = { 10: 0, 20: 0, 40: 0 };
			await invalidateAll();
		} catch (e) {
			error = errorText(e, 'Не удалось выпустить наклейки');
		} finally {
			busy = false;
		}
	}

	let batchError = $state('');

	async function act(action: () => Promise<unknown>, fallback: string, inList = false) {
		busy = true;
		error = '';
		batchError = '';
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			const message = errorText(e, fallback);
			if (inList) batchError = message;
			else error = message;
		} finally {
			busy = false;
		}
	}

	const cancelOrder = (itemId: string) =>
		act(() => api.delete(`/api/stickers/orders/${itemId}`), 'Не удалось убрать из печати');
	const setOrderWidth = (itemId: string, width: StickerWidth) =>
		act(
			() => api.post('/api/stickers/orders', { itemId, width }),
			'Не удалось поменять ширину наклейки'
		);

	async function unprint(batchId: string, ordered: number) {
		const ok = await confirmAction({
			title: 'Отметить нераспечатанными?',
			message:
				'PDF и ID наклеек этой пачки удалятся, ID снова станут свободными.' +
				(ordered > 0
					? ` ${ordered} ${plural(ordered, ['вещь', 'вещи', 'вещей'])} снова будут ждать печати.`
					: ''),
			confirmLabel: 'Не распечатано'
		});
		if (!ok) return;
		if (issuedId === batchId) issuedId = '';
		await act(
			() => api.delete(`/api/stickers/batches/${batchId}`),
			'Не удалось удалить пачку',
			true
		);
	}
</script>

<svelte:head><title>Наклейки</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Наклейки</h1>

<Card class="max-w-none p-4">
	<form class="flex flex-col gap-5" onsubmit={issue}>
		<section>
			<h2 class="font-semibold">Для вещей</h2>
			{#if data.orders.length === 0}
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Пока ничего. Наклейку для вещи заказывают на её карточке кнопкой «Напечатать».
				</p>
			{:else}
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					С названием вещи, сразу привяжутся к ней.
				</p>
				<ul
					class="mt-2 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700"
				>
					{#each data.orders as order (order.itemId)}
						<li class="flex items-center gap-2 py-2">
							<a href="/items/{order.itemId}" class="min-w-0 flex-1 break-words hover:underline"
								>{order.caption}</a
							>
							<StickerWidthSelect
								value={order.width}
								onpick={(width) => setOrderWidth(order.itemId, width)}
								disabled={busy}
								label="Ширина наклейки для «{order.caption}»"
							/>
							<button
								type="button"
								class="-me-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none disabled:opacity-50 dark:text-gray-500 dark:hover:text-red-500 dark:focus-visible:ring-primary-800"
								aria-label="Не печатать «{order.caption}»"
								title="Не печатать"
								disabled={busy}
								onclick={() => cancelOrder(order.itemId)}
							>
								<TrashBinOutline class="h-5 w-5" />
							</button>
						</li>
					{/each}
				</ul>
				{#if tooLong.length > 0}
					<Alert color="yellow" class="mt-2 text-sm">
						Не влезет в {CAPTION_MAX_LINES} строки и будет обрезано:
						<ul class="mt-1 list-disc ps-5">
							{#each tooLong as { caption, width, fitted }, i (i)}
								<li class="break-words">
									{caption} ({width} мм) → <b>{fitted.lines.join(' ')}</b>
								</li>
							{/each}
						</ul>
					</Alert>
				{/if}
			{/if}
		</section>

		<section>
			<h2 class="font-semibold">Без подписи</h2>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Привязываются к вещи, когда их отсканируют.
			</p>
			<div class="mt-2 grid grid-cols-3 gap-3">
				{#each STICKER_WIDTHS as width (width)}
					<Label class="text-sm">
						{width} мм
						<Input
							class="mt-1"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							bind:value={blankCounts[width]}
						/>
					</Label>
				{/each}
			</div>
			<div class="mt-3 flex items-center gap-3">
				<Checkbox bind:checked={fillSheet}
					>Заполнить пустое место на листе наклейками без подписи</Checkbox
				>
				<StickerWidthSelect
					value={fillWidth}
					onpick={(width) => (fillWidth = width)}
					disabled={!fillSheet}
					label="Ширина наклеек, которыми заполнить лист"
				/>
			</div>
		</section>

		<div class="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
			{#if plan.total > 0}
				<p class="text-sm">
					{sheetsLabel(plan.sheets)} A4, {plan.total}
					{plural(plan.total, [
						'наклейка',
						'наклейки',
						'наклеек'
					])}{widthText}{#if plan.captioned > 0}:
						{plan.captioned} для вещей, {plan.total - plan.captioned} без подписи{/if}{#if plan.padding > 0}
						<span class="text-gray-500 dark:text-gray-400">{padText}</span>{/if}.
				</p>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">Нечего печатать.</p>
			{/if}
			{#if tooMany}
				<p class="text-sm text-red-600 dark:text-red-500">
					За раз можно напечатать не больше {MAX_SHEETS_PER_BATCH} листов.
				</p>
			{/if}
			{#if error}<p class="text-sm text-red-600 dark:text-red-500">{error}</p>{/if}

			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy || plan.total === 0 || tooMany}>
					{busy ? 'Выпускаю…' : 'Выпустить и собрать PDF'}
				</Button>
				{#if issuedId}
					<Button color="alternative" href={pdfUrl(issuedId)} target="_blank" rel="noopener">
						<FilePdfOutline class="me-1 h-4 w-4" />Открыть PDF
					</Button>
				{/if}
			</div>
		</div>
	</form>
</Card>

<h2 class="mt-6 mb-2 text-lg font-semibold">Выпущенные пачки</h2>
{#if batchError}
	<p class="mb-2 text-sm text-red-600 dark:text-red-500" role="alert">{batchError}</p>
{/if}
{#if data.batches.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Пока ничего не напечатано.</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each data.batches as batch (batch.id)}
			<li>
				<Card class="max-w-none flex-col gap-2 p-3">
					<div class="flex min-w-0 flex-col gap-0.5">
						<span>{formatIsoDateTime(batch.createdAt)}</span>
						<span class="text-sm text-gray-500 dark:text-gray-400">
							{batchStats(batch)}
						</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button
							color="alternative"
							size="sm"
							class="h-10"
							href={pdfUrl(batch.id)}
							target="_blank"
							rel="noopener"
						>
							<FilePdfOutline class="me-1 h-4 w-4" />PDF
						</Button>
						<Button
							color="alternative"
							size="sm"
							class="h-10"
							type="button"
							disabled={busy}
							onclick={() => unprint(batch.id, batch.ordered)}
						>
							Не распечатано
						</Button>
					</div>
				</Card>
			</li>
		{/each}
	</ul>
{/if}
