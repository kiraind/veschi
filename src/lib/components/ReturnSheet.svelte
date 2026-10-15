<script lang="ts">
	import { piecesAccusative } from '$lib/domain/plural';
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { pathNodeName } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { quantityError } from '$lib/domain/workbench';
	import type { WorkbenchItem } from '$lib/server/services/workbench';
	import QuantityField from './QuantityField.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «Вернуть на место» of an item on a workbench: shows step by step where to
	 * put it (with the sticker IDs of the containers); «Готово» returns it.
	 * `amount` is how much goes back; with `askAmount` the sheet asks it itself.
	 * When the item cannot go back, says why and offers `onrelocate`.
	 */
	let {
		open = $bindable(false),
		item,
		amount = $bindable(),
		askAmount = false,
		onreturned,
		onrelocate
	}: {
		open?: boolean;
		item: Pick<
			WorkbenchItem,
			'id' | 'name' | 'quantity' | 'homePath' | 'canReturn' | 'returnBlockedReason'
		>;
		amount: number;
		askAmount?: boolean;
		onreturned: () => Promise<void>;
		onrelocate?: () => void;
	} = $props();

	let busy = $state(false);
	let error = $state('');
	const problem = $derived(quantityError(item.quantity, amount));

	$effect(() => {
		if (open) error = '';
	});

	async function done() {
		if (problem) return;
		busy = true;
		error = '';
		try {
			await api.post(`/api/items/${item.id}/return`, {
				...(amount < item.quantity ? { quantity: amount } : {})
			});
			open = false;
			await onreturned();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title="Вернуть «{item.name}»">
	{#if !item.canReturn}
		<p class="mb-4 text-gray-500 dark:text-gray-400">
			{item.returnBlockedReason}. Положите вещь в другое место.
		</p>
		{#if onrelocate}
			<Button
				class="w-full"
				onclick={() => {
					open = false;
					onrelocate();
				}}>Переложить</Button
			>
		{/if}
	{:else}
		{#if askAmount && item.quantity > 1}
			<div class="mb-4">
				<QuantityField available={item.quantity} bind:value={amount} label="Сколько вернуть" />
			</div>
		{/if}
		<p class="mb-2 text-gray-500 dark:text-gray-400">
			Положите{#if item.quantity > 1}&nbsp;{piecesAccusative(amount)}{/if}
			{item.homePath.length ? 'сюда:' : 'на верхний уровень.'}
		</p>
		{#if item.homePath.length}
			<ol class="mb-4 space-y-1 text-lg">
				{#each item.homePath as node, i (node.id)}
					<li
						class="flex items-start gap-1.5 wrap-anywhere {i === item.homePath.length - 1
							? 'font-semibold'
							: ''}"
						style:padding-inline-start="{i * 1.25}rem"
					>
						{#if i > 0}<span class="flex-none text-gray-400 dark:text-gray-500" aria-hidden="true"
								>↳</span
							>{/if}
						<span class="min-w-0">
							{pathNodeName(node)}{#if node.stickerCode}<span
									class="ms-2 font-mono text-base font-normal whitespace-nowrap text-gray-500 dark:text-gray-400"
									>{formatCode(node.stickerCode)}</span
								>{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
		{#if error}<p class="mb-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
		<Button class="w-full" onclick={done} disabled={busy || !!problem} loading={busy}>
			Готово
		</Button>
	{/if}
</Sheet>
