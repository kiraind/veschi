<script lang="ts">
	import { pieces, piecesAccusative } from '$lib/domain/plural';
	import { invalidateAll } from '$app/navigation';
	import { Button, Input, Label } from 'flowbite-svelte';
	import {
		CheckCircleOutline,
		EditOutline,
		MinusOutline,
		PlusOutline,
		TrashBinOutline
	} from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import { archivedToast } from '$lib/item-toasts';
	import { toast } from '$lib/toast.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * The quantity button on the card of a thing (containers have «Выкинуть»
	 * instead, see ContainerDiscardSheet): the quantity with − and +. More than
	 * now → «Сохранить»; less → «Использовать N» / «Выкинуть N» take N away, or
	 * «Исправить количество» just sets it (miscounted: no use in the history); as
	 * it is → «Использовать» / «Выкинуть» send the whole item to the archive.
	 */
	let {
		open = $bindable(false),
		item,
		onarchived
	}: {
		open?: boolean;
		item: { id: string; name: string; quantity: number };
		/** Called after the item went to the archive (the page may be gone). */
		onarchived: () => Promise<void>;
	} = $props();

	const id = $props.id();
	let value = $state(1);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open) {
			value = item.quantity;
			error = '';
		}
	});

	const valid = $derived(Number.isInteger(value) && value >= 1 && value <= 1_000_000);
	const taken = $derived(valid && value < item.quantity ? item.quantity - value : 0);
	const added = $derived(valid && value > item.quantity);

	/** `done` says what happened, in a toast; an archived item gets «Отменить». */
	async function run(action: () => Promise<unknown>, done: string, archived = false) {
		busy = true;
		error = '';
		// After onarchived the page (and `item`) may show another item.
		const itemId = item.id;
		try {
			await action();
			open = false;
			if (archived) await onarchived();
			else await invalidateAll();
			if (archived) archivedToast(done, itemId);
			else toast({ message: done });
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	const save = () =>
		run(() => api.patch(`/api/items/${item.id}`, { quantity: value }), `Теперь ${pieces(value)}`);

	/** Fewer things: N were used or thrown away. */
	const takeAway = (thrownAway: boolean) =>
		run(
			() => api.post(`/api/items/${item.id}/consume`, { quantity: taken, thrownAway }),
			`${thrownAway ? 'Выкинули' : 'Использовали'} ${piecesAccusative(taken)}`
		);

	async function useAll() {
		const ok = await confirmAction({
			title: `Использовать «${item.name}»?`,
			message:
				item.quantity > 1
					? `Все ${pieces(item.quantity)} уйдут в архив как использованные.`
					: 'Вещь уйдёт в архив, оттуда её можно вернуть.',
			confirmLabel: 'Использовать'
		});
		if (ok) {
			run(
				() => api.post(`/api/items/${item.id}/consume`, { quantity: item.quantity }),
				`Использовали «${item.name}»`,
				true
			);
		}
	}

	async function discardAll() {
		const ok = await confirmAction({
			title: `Выкинуть «${item.name}»?`,
			message: 'Вещь уйдёт в архив, оттуда её можно вернуть.',
			confirmLabel: 'Выкинуть'
		});
		if (ok)
			run(() => api.post(`/api/items/${item.id}/discard`, {}), `Выкинули «${item.name}»`, true);
	}

	/** One way to make it fewer: an icon, what it does and when to pick it. */
	const optionClass =
		'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left first:rounded-t-lg last:rounded-b-lg hover:bg-gray-100 focus:bg-gray-100 focus:outline-none disabled:opacity-50 dark:hover:bg-gray-700 dark:focus:bg-gray-700';
	const iconClass = 'h-6 w-6 flex-none text-gray-500 dark:text-gray-400';
	const hintClass = 'block text-sm text-gray-500 dark:text-gray-400';
</script>

<Sheet bind:open title="Количество: {item.name}">
	<div class="flex flex-col gap-4">
		<div>
			<Label for="qty-{id}">Сколько штук</Label>
			<div class="mt-1 flex items-center gap-2">
				<Button
					color="alternative"
					class="h-11 w-11 p-0"
					aria-label="Меньше"
					disabled={busy || !valid || value <= 1}
					onclick={() => value--}
				>
					<MinusOutline class="h-5 w-5" />
				</Button>
				<div class="w-24">
					<Input
						id="qty-{id}"
						class="text-center text-lg"
						type="number"
						min="1"
						step="1"
						inputmode="numeric"
						disabled={busy}
						bind:value
					/>
				</div>
				<Button
					color="alternative"
					class="h-11 w-11 p-0"
					aria-label="Больше"
					disabled={busy || !valid}
					onclick={() => value++}
				>
					<PlusOutline class="h-5 w-5" />
				</Button>
			</div>
			{#if !valid}
				<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
					Количество — целое число от 1
				</p>
			{:else if taken > 0}
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Станет на {piecesAccusative(taken)} меньше.
				</p>
			{/if}
		</div>

		{#if added}
			<div class="flex flex-wrap gap-2">
				<Button onclick={save} disabled={busy} loading={busy}>Сохранить</Button>
				<Button color="alternative" onclick={() => (value = item.quantity)} disabled={busy}
					>Отмена</Button
				>
			</div>
		{:else if taken > 0}
			<div
				class="flex flex-col divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
			>
				<button type="button" class={optionClass} disabled={busy} onclick={() => takeAway(false)}>
					<CheckCircleOutline class={iconClass} />
					<span>
						<span class="block font-medium">Использовать {piecesAccusative(taken)}</span>
						<span class={hintClass}>Израсходовали</span>
					</span>
				</button>
				<button type="button" class={optionClass} disabled={busy} onclick={() => takeAway(true)}>
					<TrashBinOutline class="h-6 w-6 flex-none text-red-600 dark:text-red-500" />
					<span>
						<span class="block font-medium text-red-600 dark:text-red-500"
							>Выкинуть {piecesAccusative(taken)}</span
						>
						<span class={hintClass}>Сломались или больше не нужны</span>
					</span>
				</button>
				<button type="button" class={optionClass} disabled={busy} onclick={save}>
					<EditOutline class={iconClass} />
					<span>
						<span class="block font-medium">Исправить количество</span>
						<span class={hintClass}>Ошиблись при подсчёте</span>
					</span>
				</button>
			</div>
		{:else if valid}
			<div class="flex flex-wrap gap-2">
				<Button color="alternative" onclick={useAll} disabled={busy}>
					{item.quantity > 1 ? 'Использовать всё' : 'Использовать'}
				</Button>
				<Button color="red" outline onclick={discardAll} disabled={busy}>
					{item.quantity > 1 ? 'Выкинуть всё' : 'Выкинуть'}
				</Button>
			</div>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Использованная или выкинутая вещь попадёт в архив, оттуда её можно вернуть.
			</p>
		{/if}
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
