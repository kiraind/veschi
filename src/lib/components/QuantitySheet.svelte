<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { MinusOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import { confirmAction } from '$lib/confirm.svelte';
	import DiscardContents, { type Contents } from './DiscardContents.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «Изменить» on the item card: the quantity with − and +. More than now →
	 * «Сохранить»; less → «Использовать N» / «Выкинуть N» take N away; as it is →
	 * «Использовать» / «Выкинуть» send the whole item to the archive. `lock`
	 * explains why the quantity of this item is always 1 (a container, a sticker).
	 */
	let {
		open = $bindable(false),
		item,
		lock = null,
		onarchived
	}: {
		open?: boolean;
		item: { id: string; name: string; quantity: number; hasChildren: boolean };
		lock?: string | null;
		/** Called after the item went to the archive (the page may be gone). */
		onarchived: () => Promise<void>;
	} = $props();

	const id = $props.id();
	let value = $state(1);
	let contents = $state<Contents>('parent');
	let workbenchId = $state<string | null>(null);
	/** «Выкинуть» of a container with contents asks what to do with them first. */
	let askContents = $state(false);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open) {
			value = item.quantity;
			contents = 'parent';
			askContents = false;
			error = '';
		}
	});

	const valid = $derived(Number.isInteger(value) && value >= 1 && value <= 1_000_000);
	const taken = $derived(valid && value < item.quantity ? item.quantity - value : 0);
	const added = $derived(valid && value > item.quantity);

	async function run(action: () => Promise<unknown>, archived = false) {
		busy = true;
		error = '';
		try {
			await action();
			open = false;
			if (archived) await onarchived();
			else await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const save = () => run(() => api.patch(`/api/items/${item.id}`, { quantity: value }));

	/** Fewer things: N were used or thrown away. */
	const takeAway = (thrownAway: boolean) =>
		run(() => api.post(`/api/items/${item.id}/consume`, { quantity: taken, thrownAway }));

	async function useAll() {
		const ok = await confirmAction({
			title: `Использовать «${item.name}»?`,
			message:
				item.quantity > 1
					? `Все ${item.quantity} шт. уйдут в архив как использованные.`
					: 'Вещь уйдёт в архив, оттуда её можно вернуть.',
			confirmLabel: 'Использовать'
		});
		if (ok) run(() => api.post(`/api/items/${item.id}/consume`, { quantity: item.quantity }), true);
	}

	async function discardAll() {
		if (item.hasChildren && !askContents) {
			askContents = true;
			return;
		}
		if (!item.hasChildren) {
			const ok = await confirmAction({
				title: `Выкинуть «${item.name}»?`,
				message: 'Вещь уйдёт в архив, оттуда её можно вернуть.',
				confirmLabel: 'Выкинуть'
			});
			if (!ok) return;
		}
		run(
			() =>
				api.post(`/api/items/${item.id}/discard`, {
					contents,
					workbenchId: contents === 'workbench' ? (workbenchId ?? undefined) : undefined
				}),
			true
		);
	}
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
					disabled={!!lock || busy || !valid || value <= 1}
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
						disabled={!!lock || busy}
						bind:value
					/>
				</div>
				<Button
					color="alternative"
					class="h-11 w-11 p-0"
					aria-label="Больше"
					disabled={!!lock || busy || !valid}
					onclick={() => value++}
				>
					<PlusOutline class="h-5 w-5" />
				</Button>
			</div>
			{#if lock}
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{lock}</p>
			{:else if !valid}
				<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
					Количество — целое число от 1
				</p>
			{:else if taken > 0}
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Станет на {taken} шт. меньше.
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
			<div class="flex flex-wrap gap-2">
				<Button onclick={() => takeAway(false)} disabled={busy}>Использовать {taken} шт.</Button>
				<Button color="red" outline onclick={() => takeAway(true)} disabled={busy}
					>Выкинуть {taken} шт.</Button
				>
			</div>
		{:else if valid}
			{#if askContents}
				<DiscardContents bind:contents bind:workbenchId />
			{/if}
			<div class="flex flex-wrap gap-2">
				{#if !askContents}
					<Button color="alternative" onclick={useAll} disabled={busy}>
						{item.quantity > 1 ? 'Использовать всё' : 'Использовать'}
					</Button>
				{/if}
				<Button
					color="red"
					outline
					onclick={discardAll}
					disabled={busy || (askContents && contents === 'workbench' && !workbenchId)}
				>
					{item.quantity > 1 ? 'Выкинуть всё' : 'Выкинуть'}
				</Button>
				{#if askContents}
					<Button color="alternative" onclick={() => (askContents = false)} disabled={busy}
						>Отмена</Button
					>
				{/if}
			</div>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Использованная или выкинутая вещь попадёт в архив, оттуда её можно вернуть.
			</p>
		{/if}
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
