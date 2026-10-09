<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatCode } from '$lib/domain/sticker-code';
	import QrScanner from './QrScanner.svelte';

	/** The item's sticker with «Привязать» / «Отвязать» actions. */
	let {
		itemId,
		sticker,
		editable
	}: {
		itemId: string;
		sticker: {
			code: string;
			status: 'FREE' | 'BOUND' | 'WRITTEN_OFF';
			caption: string | null;
		} | null;
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
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const bind = (code: string) => run(() => api.post('/api/stickers/bind', { code, itemId }));

	function unbind() {
		if (!confirm('Отвязать наклейку? Она будет списана, к вещи можно будет привязать новую.'))
			return;
		run(() => api.post('/api/stickers/unbind', { itemId }));
	}
</script>

<div class="stack sticker">
	{#if sticker?.status === 'BOUND'}
		<div class="row">
			<span>Наклейка <strong class="mono">{formatCode(sticker.code)}</strong></span>
			{#if editable}
				<button type="button" onclick={unbind} disabled={busy}>Отвязать наклейку</button>
			{/if}
		</div>
	{:else}
		<div class="row">
			{#if sticker?.status === 'WRITTEN_OFF'}
				<span class="muted"
					>Наклейка <span class="mono">{formatCode(sticker.code)}</span> списана</span
				>
			{:else}
				<span class="muted">Без наклейки</span>
			{/if}
			{#if editable}
				<button type="button" onclick={() => (binding = !binding)} disabled={busy}>
					{binding ? 'Отмена' : 'Привязать наклейку'}
				</button>
			{/if}
		</div>
		{#if binding}
			<QrScanner onscan={bind} active={binding} />
		{/if}
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	.sticker {
		gap: 0.5rem;
	}
</style>
