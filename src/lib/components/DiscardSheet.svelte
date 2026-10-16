<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { MinusOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { quantityError } from '$lib/domain/workbench';
	import { confirmAction } from '$lib/confirm.svelte';
	import DiscardContents, { type Contents } from './DiscardContents.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * The sheet «Использовать / выкинуть» of an item on a workbench: use part of
	 * it, or throw all of it away (asking what to do with a container's contents,
	 * or confirming).
	 */
	let {
		item,
		open = $bindable(false)
	}: {
		item: {
			id: string;
			name: string;
			quantity: number;
			hasChildren: boolean;
			hasSticker: boolean;
		};
		open?: boolean;
	} = $props();

	const id = $props.id();
	let busy = $state(false);
	let error = $state('');
	let useCount = $state(1);
	let contents = $state<Contents>('parent');
	let workbenchId = $state<string | null>(null);

	const useProblem = $derived(quantityError(item.quantity, useCount));
	/** A container with things inside can only be thrown away (with a choice for its contents). */
	const canUse = $derived(item.quantity > 1 || !item.hasChildren);

	$effect(() => {
		if (open) {
			error = '';
			useCount = 1;
			contents = 'parent';
		}
	});

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

	const use = () => run(() => api.post(`/api/items/${item.id}/consume`, { quantity: useCount }));

	/** A single thing used up (a chip soldered in): to the archive as used, not thrown away. */
	async function useOne() {
		const ok = await confirmAction({
			title: `Использовать «${item.name}»?`,
			message: 'Вещь уйдёт в архив как использованная, оттуда её можно вернуть.',
			confirmLabel: 'Использовать'
		});
		if (ok) await run(() => api.post(`/api/items/${item.id}/consume`, { quantity: 1 }));
	}

	async function discard() {
		if (!item.hasChildren) {
			const ok = await confirmAction({
				title: `Выкинуть «${item.name}»?`,
				message: item.hasSticker
					? 'Вещь уйдёт в архив, оттуда её можно вернуть. Наклейка будет списана.'
					: 'Вещь уйдёт в архив, оттуда её можно вернуть.',
				confirmLabel: 'Выкинуть'
			});
			if (!ok) return;
		}
		await run(() =>
			api.post(`/api/items/${item.id}/discard`, {
				contents,
				workbenchId: contents === 'workbench' ? (workbenchId ?? undefined) : undefined
			})
		);
	}
</script>

<Sheet bind:open title="Использовать или выкинуть: {item.name}">
	<div class="flex flex-col gap-4">
		{#if item.quantity > 1}
			<div>
				<Label for="use-{id}">Сколько использовать (из {item.quantity})</Label>
				<div class="mt-1 flex items-center gap-2">
					<Button
						color="alternative"
						class="h-11 w-11 p-0"
						aria-label="Меньше"
						disabled={busy || useCount <= 1}
						onclick={() => useCount--}
					>
						<MinusOutline class="h-5 w-5" />
					</Button>
					<div class="w-24">
						<Input
							id="use-{id}"
							class="text-center text-lg"
							type="number"
							min="1"
							max={item.quantity}
							step="1"
							inputmode="numeric"
							disabled={busy}
							bind:value={useCount}
						/>
					</div>
					<Button
						color="alternative"
						class="h-11 w-11 p-0"
						aria-label="Больше"
						disabled={busy || useCount >= item.quantity}
						onclick={() => useCount++}
					>
						<PlusOutline class="h-5 w-5" />
					</Button>
				</div>
				{#if useProblem}
					<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{useProblem}</p>
				{/if}
			</div>
		{/if}

		{#if item.hasChildren}
			<DiscardContents bind:contents bind:workbenchId />
		{/if}

		<div class="grid gap-2 {canUse ? 'grid-cols-2' : ''}">
			{#if item.quantity > 1}
				<Button class="h-11" onclick={use} disabled={busy || !!useProblem}>
					{useCount === item.quantity ? 'Использовать всё' : 'Использовать'}
				</Button>
			{:else if canUse}
				<Button class="h-11" onclick={useOne} disabled={busy}>Использовать</Button>
			{/if}
			<Button
				color="red"
				outline
				class="h-11"
				onclick={discard}
				disabled={busy || (contents === 'workbench' && !workbenchId)}
			>
				{item.quantity > 1 ? 'Выкинуть всё' : 'Выкинуть'}
			</Button>
		</div>
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{item.quantity > 1 ? 'Если использовать или выкинуть всё, вещь' : 'Вещь'} уйдёт в архив,
			{item.hasSticker ? 'её наклейка будет списана.' : 'оттуда её можно вернуть.'}
		</p>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
