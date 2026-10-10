<script lang="ts">
	import { formatIsoDateTime } from '$lib/domain/dates';
	import { invalidateAll } from '$app/navigation';
	import { Alert, Button, Card, Input, Label, Textarea } from 'flowbite-svelte';
	import { CloseOutline, FilePdfOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import { plural } from '$lib/domain/plural';
	import {
		CAPTION_MAX_LINES,
		MAX_SHEETS_PER_BATCH,
		wrapCaption,
		parseCaptions,
		planSheets
	} from '$lib/domain/sticker-sheet';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let captionsText = $state('');
	let blankCount = $state(0);
	let busy = $state(false);
	let error = $state('');
	let issuedId = $state('');

	const typed = $derived(parseCaptions(captionsText));
	// Ordered stickers go first, with the item's name as the caption (see issueBatch).
	const captions = $derived([...data.orders.map((o) => o.caption), ...typed]);
	const blank = $derived(Number.isInteger(blankCount) && blankCount > 0 ? blankCount : 0);
	const plan = $derived(planSheets(captions, blank));
	const tooLong = $derived(
		captions
			.map((caption) => ({ caption, fitted: wrapCaption(caption) }))
			.filter(({ fitted }) => fitted.truncated)
	);
	const tooMany = $derived(plan.sheets > MAX_SHEETS_PER_BATCH);

	const captionedText = $derived(
		`${plan.captioned} с подписью` +
			(data.orders.length > 0 ? ` (из них ${data.orders.length} по заказу)` : '')
	);
	// A leading space: Svelte drops the whitespace between «подписи» and an {#if}.
	const padText = $derived(` (ещё ${plan.padding} добавлено, чтобы заполнить лист)`);

	function batchStats(batch: PageData['batches'][number]): string {
		return [
			`${batch.total} шт., с подписью ${batch.captioned}`,
			batch.ordered > 0 ? `по заказу ${batch.ordered}` : '',
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
				captions: typed,
				blankCount: blank,
				orderItemIds: data.orders.map((o) => o.itemId)
			});
			issuedId = batch.id;
			captionsText = '';
			blankCount = 0;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Не удалось выпустить наклейки';
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
			const message = e instanceof ApiError ? e.message : fallback;
			if (inList) batchError = message;
			else error = message;
		} finally {
			busy = false;
		}
	}

	const cancelOrder = (itemId: string) =>
		act(() => api.delete(`/api/stickers/orders/${itemId}`), 'Не удалось отменить заказ');

	async function unprint(batchId: string, ordered: number) {
		const ok = await confirmAction({
			title: 'Отметить нераспечатанными?',
			message:
				'PDF и ID наклеек этой пачки удалятся, ID снова станут свободными.' +
				(ordered > 0
					? ` ${ordered} ${plural(ordered, ['вещь', 'вещи', 'вещей'])} снова будут ждать наклейку.`
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
	<form class="flex flex-col gap-3" onsubmit={issue}>
		{#if data.orders.length > 0}
			<div>
				<p class="mb-1 text-sm font-medium text-gray-900 dark:text-white">
					Заказаны для вещей — напечатаются и сразу привяжутся
				</p>
				<ul class="flex flex-col">
					{#each data.orders as order (order.itemId)}
						<li class="flex items-center justify-between gap-2">
							<a href="/items/{order.itemId}" class="min-w-0 py-2 break-words hover:underline"
								>{order.caption}</a
							>
							<Button
								class="shrink-0"
								size="sm"
								color="alternative"
								type="button"
								aria-label="Отменить заказ"
								title="Отменить заказ"
								disabled={busy}
								onclick={() => cancelOrder(order.itemId)}
							>
								<CloseOutline class="h-4 w-4" />
							</Button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		<Label>
			{data.orders.length > 0 ? 'Ещё подписи' : 'Подписи'} — по одной наклейке на строку
			<Textarea
				class="mt-1 w-full"
				bind:value={captionsText}
				rows={6}
				placeholder="Припой&#10;Коробка с NE555"
			/>
		</Label>
		{#if tooLong.length > 0}
			<Alert color="yellow" class="text-sm">
				Не влезет в {CAPTION_MAX_LINES} строки и будет обрезано:
				<ul class="mt-1 list-disc ps-5">
					{#each tooLong as { caption, fitted }, i (i)}
						<li class="break-words">{caption} → <b>{fitted.lines.join(' ')}</b></li>
					{/each}
				</ul>
			</Alert>
		{/if}
		<Label>
			Без подписи
			<Input
				class="mt-1"
				type="number"
				min="0"
				step="1"
				inputmode="numeric"
				bind:value={blankCount}
			/>
		</Label>

		{#if plan.total > 0}
			<p class="text-sm">
				{sheetsLabel(plan.sheets)} A4, {plan.total} наклеек: {captionedText},
				{plan.total - plan.captioned} без подписи{#if plan.padding > 0}
					<span class="text-gray-500 dark:text-gray-400">{padText}</span>{/if}.
			</p>
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
							href={pdfUrl(batch.id)}
							target="_blank"
							rel="noopener"
						>
							<FilePdfOutline class="me-1 h-4 w-4" />PDF
						</Button>
						<Button
							color="alternative"
							size="sm"
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
