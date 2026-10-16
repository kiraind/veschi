<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Input, Label } from 'flowbite-svelte';
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

	let busy = $state(false);
	let error = $state('');
	let useCount = $state(1);
	let contents = $state<Contents>('parent');
	let workbenchId = $state<string | null>(null);

	const useProblem = $derived(quantityError(item.quantity, useCount));

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
	<div class="flex flex-col gap-3">
		{#if item.quantity > 1}
			<div class="flex flex-wrap items-end gap-2">
				<Label class="min-w-40 flex-1">
					Использовать (из {item.quantity})
					<Input
						class="mt-1"
						type="number"
						min="1"
						max={item.quantity}
						step="1"
						bind:value={useCount}
					/>
				</Label>
				<Button onclick={use} disabled={busy || !!useProblem}>Использовать</Button>
			</div>
			{#if useProblem}<p class="text-sm text-red-600 dark:text-red-500">{useProblem}</p>{/if}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Если использовать всё, вещь уйдёт в архив.
			</p>
		{/if}

		{#if item.hasChildren}
			<DiscardContents bind:contents bind:workbenchId />
		{/if}

		<p class="text-sm text-gray-500 dark:text-gray-400">
			{item.hasSticker
				? 'Выкинутая вещь попадёт в архив, её наклейка будет списана.'
				: 'Выкинутая вещь попадёт в архив, оттуда её можно вернуть.'}
		</p>
		<div class="flex flex-wrap gap-2">
			{#if item.quantity === 1 && !item.hasChildren}
				<Button color="alternative" onclick={useOne} disabled={busy}>Использовать</Button>
			{/if}
			<Button
				color="red"
				outline
				onclick={discard}
				disabled={busy || (contents === 'workbench' && !workbenchId)}
			>
				{item.quantity > 1 ? 'Выкинуть всё' : 'Выкинуть'}
			</Button>
			<Button color="alternative" onclick={() => (open = false)} disabled={busy}>Отмена</Button>
		</div>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
