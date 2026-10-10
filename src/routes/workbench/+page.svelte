<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { formatPath, pathNodeName } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import DiscardDialog from '$lib/components/DiscardDialog.svelte';
	import QuantityField from '$lib/components/QuantityField.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { quantityError } from '$lib/domain/workbench';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import Thumb from '$lib/components/Thumb.svelte';
	import { Badge, Button, Card } from 'flowbite-svelte';
	import {
		ArrowsRepeatOutline,
		CogOutline,
		TrashBinOutline,
		UndoOutline
	} from 'flowbite-svelte-icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const benches = $derived(
		data.workbenches.map((bench) => ({
			...bench,
			items: data.items.filter((i) => i.workbenchId === bench.id)
		}))
	);

	let relocatingId = $state<string | null>(null);
	/** The item whose «Использовать / выкинуть» form is open. */
	let discardingId = $state<string | null>(null);

	/** The action buttons of an item; labels are dropped when they don't fit in one row. */
	const RETURN_LABEL = 'Вернуть на место';
	const RELOCATE_LABEL = 'Положить в другое место';
	const DISCARD_LABEL = 'Использовать / выкинуть';
	const ACTION_LABELS = [RETURN_LABEL, RELOCATE_LABEL, DISCARD_LABEL];
	let actionsWidth = $state(0);
	let labelledWidth = $state(0);
	const compact = $derived(labelledWidth > actionsWidth);
	const actionClass = $derived(compact ? 'h-11 px-2' : 'h-11 whitespace-nowrap');
	const actionIconClass = $derived(compact ? 'h-5 w-5' : 'me-2 h-5 w-5 flex-none');
	let busyId = $state<string | null>(null);
	let error = $state<{ id: string; message: string } | null>(null);

	async function act(id: string, action: () => Promise<unknown>) {
		busyId = id;
		error = null;
		try {
			await action();
			relocatingId = null;
			await invalidateAll();
		} catch (e) {
			error = { id, message: e instanceof Error ? e.message : String(e) };
		} finally {
			busyId = null;
		}
	}

	/** How much of each item «Вернуть» / «Положить» puts away; missing = all of it. */
	let amounts = $state<Record<string, number>>({});

	function part(item: { id: string; quantity: number }) {
		const amount = amounts[item.id] ?? item.quantity;
		return amount < item.quantity ? { quantity: amount } : {};
	}

	const partProblem = (item: { id: string; quantity: number }) =>
		quantityError(item.quantity, amounts[item.id] ?? item.quantity);

	async function putAway(item: { id: string; quantity: number }, path: string, body: object) {
		await act(item.id, () => api.post(`/api/items/${item.id}/${path}`, { ...body, ...part(item) }));
		if (error?.id !== item.id) delete amounts[item.id];
	}

	type Listed = PageData['items'][number];

	/** «Вернуть на место» first shows where exactly to put the item; «Готово» returns it. */
	let returning = $state<Listed | null>(null);
	let returningOpen = $state(false);

	function askReturn(item: Listed) {
		returning = item;
		returningOpen = true;
	}

	async function confirmReturn(item: Listed) {
		await putAway(item, 'return', {});
		if (error?.id !== item.id) returningOpen = false;
	}

	const relocate = (item: { id: string; quantity: number }, containerId: string) =>
		putAway(item, 'relocate', { containerId });
</script>

<svelte:head><title>Рабочий стол — Вещи</title></svelte:head>

<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
	<h1 class="text-2xl font-bold">Рабочий стол</h1>
	<Button href="/workbench/settings" color="alternative" size="sm">
		<CogOutline class="me-1.5 h-4 w-4" />Настроить столы
	</Button>
</div>

{#if benches.length === 0}
	<Card class="max-w-none space-y-3 p-4">
		<p>Рабочих столов пока нет. Стол — место для вещей, которые вы достали и используете.</p>
		<div><Button href="/workbench/settings">Создать рабочий стол</Button></div>
	</Card>
{/if}

{#each benches as bench (bench.id)}
	<section>
		<h2 class="mt-6 mb-2 flex items-center gap-2 text-lg font-semibold break-words">
			<WorkbenchIcon icon={bench.icon} class="h-6 w-6 text-gray-500 dark:text-gray-400" />
			<span class="min-w-0">{bench.name}</span>
		</h2>
		{#if bench.items.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">Пусто.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each bench.items as item (item.id)}
					<li>
						<Card class="max-w-none space-y-3 p-4">
							<div class="flex items-start gap-3">
								<Thumb photoKey={item.photoKey} size={56} container={item.isContainer} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<a
											href="/items/{item.id}"
											class="min-w-0 font-semibold break-words text-primary-700 hover:underline dark:text-primary-500"
											>{item.name}</a
										>
										{#if item.quantity > 1}<Badge
												color="gray"
												class="dark:bg-gray-700 dark:text-gray-200">{item.quantity} шт.</Badge
											>{/if}
									</div>
									<div class="mt-1 text-sm break-words text-gray-500 dark:text-gray-400">
										Откуда: {item.homePath.length ? formatPath(item.homePath) : 'верхний уровень'}
										{#if item.takenByName}· достал(а) {item.takenByName}{/if}
									</div>
								</div>
							</div>

							{#if item.quantity > 1}
								<QuantityField
									available={item.quantity}
									bind:value={
										() => amounts[item.id] ?? item.quantity, (v) => (amounts[item.id] = v)
									}
									label="Сколько убрать со стола"
								/>
							{/if}
							<div class="relative" bind:clientWidth={actionsWidth}>
								<!-- The same buttons with labels, unseen: their width decides whether labels fit. -->
								<div
									class="invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
									aria-hidden="true"
								>
									<div class="flex w-max gap-2 whitespace-nowrap" bind:clientWidth={labelledWidth}>
										{#each ACTION_LABELS as label (label)}
											<span class="inline-flex items-center px-5 text-sm font-medium"
												><span class="me-2 h-5 w-5"></span>{label}</span
											>
										{/each}
									</div>
								</div>
								<div class="grid grid-cols-3 gap-2 {compact ? '' : 'sm:flex'}">
									<Button
										class={actionClass}
										title={RETURN_LABEL}
										aria-label={RETURN_LABEL}
										onclick={() => askReturn(item)}
										disabled={!item.canReturn || busyId === item.id || !!partProblem(item)}
									>
										<UndoOutline class={actionIconClass} />
										{#if !compact}{RETURN_LABEL}{/if}
									</Button>
									<Button
										color="alternative"
										class={actionClass}
										title={RELOCATE_LABEL}
										aria-label={RELOCATE_LABEL}
										onclick={() => {
											relocatingId = relocatingId === item.id ? null : item.id;
											discardingId = null;
										}}
										disabled={busyId === item.id}
									>
										<ArrowsRepeatOutline class={actionIconClass} />
										{#if !compact}{RELOCATE_LABEL}{/if}
									</Button>
									<Button
										color="alternative"
										class={actionClass}
										title={DISCARD_LABEL}
										aria-label={DISCARD_LABEL}
										onclick={() => {
											discardingId = discardingId === item.id ? null : item.id;
											relocatingId = null;
										}}
										disabled={busyId === item.id}
									>
										<TrashBinOutline class={actionIconClass} />
										{#if !compact}{DISCARD_LABEL}{/if}
									</Button>
								</div>
							</div>
							{#if !item.canReturn}
								<p class="text-sm text-gray-500 dark:text-gray-400">
									{item.returnBlockedReason}. Положите вещь в другое место.
								</p>
							{/if}

							{#if relocatingId === item.id}
								<ContainerPicker
									title="Куда положить «{item.name}»?"
									excludeId={item.id}
									onpick={(container: { id: string }) => {
										if (!partProblem(item)) relocate(item, container.id);
									}}
								/>
							{/if}

							<DiscardDialog
								bind:open={
									() => discardingId === item.id, (v) => (discardingId = v ? item.id : null)
								}
								button={false}
								item={{
									id: item.id,
									name: item.name,
									quantity: item.quantity,
									hasChildren: item.hasChildren
								}}
							/>

							{#if error?.id === item.id}<p
									class="text-sm text-red-600 dark:text-red-500"
									role="alert"
								>
									{error.message}
								</p>{/if}
						</Card>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}

<Sheet bind:open={returningOpen} title="Вернуть «{returning?.name ?? ''}»">
	{#if returning}
		{@const item = returning}
		{@const amount = amounts[item.id] ?? item.quantity}
		<p class="mb-2 text-gray-500 dark:text-gray-400">
			Положите{#if item.quantity > 1}&nbsp;{amount} шт.{/if}
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
		{#if error?.id === item.id}<p class="mb-2 text-sm text-red-600 dark:text-red-500" role="alert">
				{error.message}
			</p>{/if}
		<Button class="w-full" onclick={() => confirmReturn(item)} disabled={busyId === item.id}>
			Готово
		</Button>
	{/if}
</Sheet>
