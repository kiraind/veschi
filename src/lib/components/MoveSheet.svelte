<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { quantityError } from '$lib/domain/workbench';
	import ContainerPicker from './ContainerPicker.svelte';
	import QuantityField from './QuantityField.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «Переложить» (on the item page) and «Вернуть в другое место» (on the
	 * workbench): asks how much when there is more than one, then where — a
	 * container found by name or sticker ID, scanned, one of the recent and
	 * neighbouring places offered before anything is typed, or the top level.
	 */
	let {
		open = $bindable(false),
		title,
		item,
		onmoved
	}: {
		open?: boolean;
		title: string;
		item: {
			id: string;
			quantity: number;
			parentId: string | null;
			/** On a workbench: any container will do, the one it lies in too. */
			onBench: boolean;
		};
		onmoved: () => Promise<void>;
	} = $props();

	let amount = $state(1);
	let busy = $state(false);
	let error = $state('');
	const problem = $derived(quantityError(item.quantity, amount));

	$effect(() => {
		if (open) {
			amount = item.quantity;
			error = '';
		}
	});

	async function moveTo(parentId: string | null) {
		if (problem) return;
		busy = true;
		error = '';
		try {
			await api.post(`/api/items/${item.id}/move`, {
				parentId,
				...(amount < item.quantity ? { quantity: amount } : {})
			});
			open = false;
			await onmoved();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open {title}>
	<div class="flex flex-col gap-3">
		{#if item.quantity > 1}
			<QuantityField available={item.quantity} bind:value={amount} label="Сколько переложить" />
		{/if}
		<ContainerPicker
			title="Куда?"
			card={false}
			excludeId={item.id}
			excludeIds={item.parentId && !item.onBench ? [item.parentId] : []}
			suggestFor={item.id}
			onpick={(c) => moveTo(c.id)}
		/>
		{#if item.parentId}
			<Button color="alternative" onclick={() => moveTo(null)} disabled={busy || !!problem}>
				На верхний уровень
			</Button>
		{/if}
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
