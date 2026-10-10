<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import {
		CAPTION_MAX_LENGTH,
		MAX_SHEETS_PER_BATCH,
		isCaptionTooLong,
		parseCaptions,
		planSheets,
		truncateCaption
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
	const plan = $derived(planSheets(captions.length, blank));
	const tooLong = $derived(captions.filter(isCaptionTooLong));
	const tooMany = $derived(plan.sheets > MAX_SHEETS_PER_BATCH);

	const pdfUrl = (id: string) => `/api/stickers/batches/${id}/pdf`;
	const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

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

<h1>Наклейки</h1>

<form class="card stack" onsubmit={issue}>
	<label>
		Подписи — по одной наклейке на строку
		<textarea bind:value={captionsText} rows="6" placeholder="Припой&#10;Коробка с NE555"
		></textarea>
	</label>
	{#if tooLong.length > 0}
		<div class="warning">
			Подпись длиннее {CAPTION_MAX_LENGTH} символов не влезет и будет обрезана:
			<ul>
				{#each tooLong as caption, i (i)}
					<li>{caption} → <b>{truncateCaption(caption)}</b></li>
				{/each}
			</ul>
		</div>
	{/if}
	<label>
		Без подписи
		<input type="number" min="0" step="1" inputmode="numeric" bind:value={blankCount} />
	</label>

	{#if plan.total > 0}
		<p>
			{sheetsLabel(plan.sheets)} A4, {plan.total} наклеек: {plan.captioned} с подписью,
			{plan.total - plan.captioned} без подписи{#if plan.padding > 0}
				<span class="muted">(ещё {plan.padding} добавлено, чтобы заполнить лист)</span>{/if}.
		</p>
	{/if}
	{#if tooMany}
		<p class="error">За раз можно напечатать не больше {MAX_SHEETS_PER_BATCH} листов.</p>
	{/if}
	{#if error}<p class="error">{error}</p>{/if}

	<div class="row">
		<button class="primary" type="submit" disabled={busy || plan.total === 0 || tooMany}>
			{busy ? 'Выпускаю…' : 'Выпустить и собрать PDF'}
		</button>
		{#if issuedId}
			<a class="button" href={pdfUrl(issuedId)} target="_blank" rel="noopener">Открыть PDF</a>
		{/if}
	</div>
</form>

<h2>Выпущенные пачки</h2>
{#if data.batches.length === 0}
	<p class="muted">Пока ничего не напечатано.</p>
{:else}
	<ul class="list">
		{#each data.batches as batch (batch.id)}
			<li class="card row batch">
				<div class="stack info">
					<span>{dateFormat.format(new Date(batch.createdAt))}</span>
					<span class="muted">
						{batch.total} шт., с подписью {batch.captioned} · свободно {batch.free} · привязано
						{batch.bound}{#if batch.writtenOff > 0}
							· списано {batch.writtenOff}{/if}
					</span>
				</div>
				<a class="button" href={pdfUrl(batch.id)} target="_blank" rel="noopener">PDF</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.warning {
		background: var(--highlight);
		border-radius: var(--radius);
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
	}
	.warning ul {
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
	}
	.batch {
		justify-content: space-between;
		flex-wrap: nowrap;
	}
	.info {
		gap: 0.15rem;
	}
</style>
