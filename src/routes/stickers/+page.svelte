<script lang="ts">
	import { formatIsoDateTime } from '$lib/domain/dates';
	import { invalidateAll } from '$app/navigation';
	import { Alert, Button, Card, Input, Label, Textarea } from 'flowbite-svelte';
	import { FilePdfOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
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

	const captions = $derived(parseCaptions(captionsText));
	const blank = $derived(Number.isInteger(blankCount) && blankCount > 0 ? blankCount : 0);
	const plan = $derived(planSheets(captions, blank));
	const tooLong = $derived(
		captions
			.map((caption) => ({ caption, fitted: wrapCaption(caption) }))
			.filter(({ fitted }) => fitted.truncated)
	);
	const tooMany = $derived(plan.sheets > MAX_SHEETS_PER_BATCH);

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
				captions,
				blankCount: blank
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
</script>

<svelte:head><title>Наклейки</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Наклейки</h1>

<Card class="max-w-none p-4">
	<form class="flex flex-col gap-3" onsubmit={issue}>
		<Label>
			Подписи — по одной наклейке на строку
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
				{sheetsLabel(plan.sheets)} A4, {plan.total} наклеек: {plan.captioned} с подписью,
				{plan.total - plan.captioned} без подписи{#if plan.padding > 0}
					<span class="text-gray-500 dark:text-gray-400"
						>(ещё {plan.padding} добавлено, чтобы заполнить лист)</span
					>{/if}.
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
{#if data.batches.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Пока ничего не напечатано.</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each data.batches as batch (batch.id)}
			<li>
				<Card class="max-w-none flex-row items-center justify-between gap-3 p-3">
					<div class="flex min-w-0 flex-col gap-0.5">
						<span>{formatIsoDateTime(batch.createdAt)}</span>
						<span class="text-sm text-gray-500 dark:text-gray-400">
							{batch.total} шт., с подписью {batch.captioned} · свободно {batch.free} · привязано
							{batch.bound}{#if batch.writtenOff > 0}
								· списано {batch.writtenOff}{/if}
						</span>
					</div>
					<Button
						class="shrink-0"
						color="alternative"
						size="sm"
						href={pdfUrl(batch.id)}
						target="_blank"
						rel="noopener"
					>
						<FilePdfOutline class="me-1 h-4 w-4" />PDF
					</Button>
				</Card>
			</li>
		{/each}
	</ul>
{/if}
