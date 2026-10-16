<script lang="ts">
	import { pieces } from '$lib/domain/plural';
	import { invalidateAll } from '$app/navigation';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import DiscardSheet from '$lib/components/DiscardSheet.svelte';
	import MoveSheet from '$lib/components/MoveSheet.svelte';
	import ReturnSheet from '$lib/components/ReturnSheet.svelte';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import Thumb from '$lib/components/Thumb.svelte';
	import { Badge, Button, Card } from 'flowbite-svelte';
	import {
		ArrowDownToBracketOutline,
		ArrowsRepeatOutline,
		ArrowUpFromBracketOutline,
		CogOutline,
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

	/**
	 * The action buttons of an item: short labels, the same on every screen. On
	 * phones the label goes under the icon, so three buttons fit in a row.
	 */
	const RETURN_LABEL = 'На место';
	const RELOCATE_LABEL = 'Переложить';
	const DISCARD_LABEL = 'Удалить';
	/** A new item has no place to go back to: it is put somewhere instead. */
	const PUT_LABEL = 'Положить';
	const actionClass =
		'h-14 flex-col gap-1 px-1 text-xs leading-none sm:h-11 sm:flex-row sm:gap-2 sm:px-5 sm:text-sm';
	const actionIconClass = 'h-5 w-5 flex-none';

	type Listed = PageData['items'][number];

	/** «На место» first shows where exactly to put the item; «Готово» returns it. */
	let returning = $state<Listed | null>(null);
	let returningOpen = $state(false);
	/** How much «Вернуть на место» puts back (the sheet asks it). */
	let returnAmount = $state(1);

	function askReturn(item: Listed) {
		returning = item;
		returnAmount = item.quantity;
		returningOpen = true;
	}

	/** «Переложить» (and «Положить» for a new item): the same sheet as on the item page. */
	let relocating = $state<Listed | null>(null);
	let relocatingOpen = $state(false);

	/** «Удалить» opens the sheet «Использовать / выкинуть». */
	let discarding = $state<Listed | null>(null);
	let discardingOpen = $state(false);

	function askDiscard(item: Listed) {
		discarding = item;
		discardingOpen = true;
	}

	function askRelocate(item: Listed) {
		relocating = item;
		relocatingOpen = true;
	}
</script>

<svelte:head><title>Рабочий стол — veschi</title></svelte:head>

<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
	<h1 class="text-2xl font-bold">Рабочий стол</h1>
	<Button href="/workbench/settings" color="alternative" size="sm" class="h-10">
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
												class="dark:bg-gray-700 dark:text-gray-200">{pieces(item.quantity)}</Badge
											>{/if}
										{#if item.stickerCode}<span
												class="font-mono text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
												>{formatCode(item.stickerCode)}</span
											>{/if}
									</div>
									<div class="mt-1 text-sm break-words text-gray-500 dark:text-gray-400">
										{#if item.isNew}
											Откуда: новая
											{#if item.takenByName}· добавил(а) {item.takenByName}{/if}
										{:else}
											Откуда: {item.homePath.length ? formatPath(item.homePath) : 'верхний уровень'}
											{#if item.takenByName}· достал(а) {item.takenByName}{/if}
										{/if}
									</div>
								</div>
							</div>

							<div class="grid grid-cols-3 gap-2 sm:flex">
								{#if item.isNew}
									<!-- Takes the place of both «На место» and «Переложить». -->
									<Button
										class="col-span-2 {actionClass}"
										title="Положить в контейнер"
										onclick={() => askRelocate(item)}
									>
										<ArrowDownToBracketOutline class={actionIconClass} />{PUT_LABEL}
									</Button>
								{:else}
									<Button
										class={actionClass}
										title="Вернуть на место"
										onclick={() => askReturn(item)}
										disabled={!item.canReturn}
									>
										<UndoOutline class={actionIconClass} />{RETURN_LABEL}
									</Button>
									<Button
										color="alternative"
										class={actionClass}
										title="Переложить в другое место"
										onclick={() => askRelocate(item)}
									>
										<ArrowsRepeatOutline class={actionIconClass} />{RELOCATE_LABEL}
									</Button>
								{/if}
								<Button
									color="alternative"
									class={actionClass}
									title="Использовать или выкинуть"
									onclick={() => askDiscard(item)}
								>
									<ArrowUpFromBracketOutline class={actionIconClass} />{DISCARD_LABEL}
								</Button>
							</div>
							{#if !item.canReturn}
								<p class="text-sm text-gray-500 dark:text-gray-400">
									{item.returnBlockedReason}. Переложите вещь в другое место.
								</p>
							{/if}
						</Card>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}

{#if returning}
	<ReturnSheet
		bind:open={returningOpen}
		item={returning}
		bind:amount={returnAmount}
		askAmount
		onreturned={invalidateAll}
	/>
{/if}
{#if discarding}
	<DiscardSheet
		bind:open={discardingOpen}
		item={{
			id: discarding.id,
			name: discarding.name,
			quantity: discarding.quantity,
			hasChildren: discarding.hasChildren,
			hasSticker: !!discarding.stickerCode
		}}
	/>
{/if}
{#if relocating}
	<MoveSheet
		bind:open={relocatingOpen}
		title="{relocating.isNew ? PUT_LABEL : RELOCATE_LABEL} «{relocating.name}»"
		item={{
			id: relocating.id,
			quantity: relocating.quantity,
			parentId: relocating.workbenchId,
			onBench: true
		}}
		onmoved={invalidateAll}
	/>
{/if}
