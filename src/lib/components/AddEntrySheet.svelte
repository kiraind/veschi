<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Input } from 'flowbite-svelte';
	import { CloseOutline, PlusOutline, QrCodeOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { normalizeParamKey } from '$lib/domain/params';
	import { pieces } from '$lib/domain/plural';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { ItemCard } from '$lib/server/services/items';
	import type { SearchGroup } from '$lib/server/services/search';
	import type { TypeSummary } from '$lib/server/services/types';
	import QrScanner from './QrScanner.svelte';
	import Sheet from './Sheet.svelte';
	import StepperField from './StepperField.svelte';
	import Thumb from './Thumb.svelte';

	/**
	 * «Добавить» on a collection page: find a type or a particular item by
	 * name or sticker ID (or scan the sticker), or name a new type for a thing
	 * nobody has yet; then say how many.
	 */
	let {
		open = $bindable(false),
		collection,
		existing = []
	}: {
		open?: boolean;
		collection: { id: string; name: string };
		/** Lines already in the collection: picking one of them adds to its quantity. */
		existing?: { kind: 'type' | 'item'; targetId: string; quantity: number }[];
	} = $props();

	type Target = {
		/** `new` — a type created by name. */
		kind: 'type' | 'item' | 'new';
		id: string | null;
		name: string;
		photoKey: string | null;
		isContainer: boolean;
		/** «тип · есть 5 штук», the place of an item. */
		detail: string;
	};

	type TypeOption = {
		id: string;
		name: string;
		photoKey: string | null;
		isContainer: boolean;
		total: number;
		items: SearchGroup['locations'];
	};

	let query = $state('');
	let options = $state<TypeOption[]>([]);
	let exactType = $state(false);
	let target = $state<Target | null>(null);
	let quantity = $state(1);
	let scanning = $state(false);
	let message = $state('');
	let busy = $state(false);
	let error = $state('');
	let request = 0;

	$effect(() => {
		if (!open) return;
		query = '';
		target = null;
		quantity = 1;
		scanning = false;
		message = '';
		error = '';
	});

	// Items come from the search (grouped by type); types without items from the type list.
	$effect(() => {
		const q = query.trim();
		if (!q) {
			options = [];
			exactType = false;
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			try {
				const [groups, types] = await Promise.all([
					api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`),
					api.get<TypeSummary[]>(`/api/types?q=${encodeURIComponent(q)}`)
				]);
				if (id !== request) return;
				// A local lookup while building the list, not state.
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const byId = new Map<string, TypeOption>();
				for (const g of groups.slice(0, 10)) {
					byId.set(g.typeId, {
						id: g.typeId,
						name: g.typeName,
						photoKey: g.photoKey,
						isContainer: g.isContainer,
						total: g.total,
						items: g.locations.slice(0, 5)
					});
				}
				for (const t of types) {
					if (byId.size >= 15) break;
					if (!byId.has(t.id)) {
						byId.set(t.id, {
							id: t.id,
							name: t.name,
							photoKey: t.photoKey,
							isContainer: t.isContainer,
							total: t.itemCount,
							items: []
						});
					}
				}
				options = [...byId.values()];
				exactType = types.some((t) => normalizeParamKey(t.name) === normalizeParamKey(q));
				message = '';
			} catch (e) {
				if (id !== request) return;
				options = [];
				message = errorText(e);
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	function pickType(t: TypeOption) {
		target = {
			kind: 'type',
			id: t.id,
			name: t.name,
			photoKey: t.photoKey,
			isContainer: t.isContainer,
			detail: t.total ? `любые такие · есть ${pieces(t.total)}` : 'любые такие · пока нет ни одной'
		};
	}

	function pickItem(t: TypeOption, item: SearchGroup['locations'][number]) {
		target = {
			kind: 'item',
			id: item.itemId,
			name: item.name,
			photoKey: t.photoKey,
			isContainer: t.isContainer,
			detail: formatPath(item.path) || 'верхний уровень'
		};
	}

	function pickNew() {
		target = {
			kind: 'new',
			id: null,
			name: query.trim(),
			photoKey: null,
			isContainer: false,
			detail: 'новый тип, вещей пока нет'
		};
	}

	async function onscan(code: string) {
		message = '';
		try {
			const resolved = await api.get<{ status: string; itemId?: string }>(
				`/api/stickers/resolve?code=${encodeURIComponent(code)}`
			);
			if (resolved.status !== 'bound' || !resolved.itemId) {
				message =
					resolved.status === 'free'
						? 'Эта наклейка ещё ни к чему не привязана'
						: resolved.status === 'written_off'
							? 'Наклейка списана'
							: 'Такой наклейки нет';
				return;
			}
			const card = await api.get<ItemCard>(`/api/items/${resolved.itemId}`);
			if (card.item.isWorkbench) {
				message = 'Рабочий стол нельзя добавить в коллекцию';
				return;
			}
			scanning = false;
			target = {
				kind: 'item',
				id: card.item.id,
				name: card.item.displayName,
				photoKey: card.type?.photoKey ?? null,
				isContainer: card.item.isContainer,
				detail: formatPath(card.path) || 'верхний уровень'
			};
		} catch (e) {
			message = errorText(e);
		}
	}

	const valid = $derived(Number.isInteger(quantity) && quantity >= 1 && quantity <= 1_000_000);
	const already = $derived(
		target && target.kind !== 'new'
			? existing.find((e) => e.kind === target!.kind && e.targetId === target!.id)
			: undefined
	);

	async function add() {
		if (!target || !valid) return;
		const t = target;
		busy = true;
		error = '';
		try {
			await api.post(`/api/collections/${collection.id}/entries`, {
				...(t.kind === 'item'
					? { itemId: t.id }
					: t.kind === 'type'
						? { typeId: t.id }
						: { typeName: t.name }),
				quantity
			});
			open = false;
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}

	const optionClass =
		'flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700';
</script>

<Sheet bind:open title="Добавить в «{collection.name}»">
	<div class="flex flex-col gap-3">
		{#if target}
			<div
				class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
			>
				<Thumb photoKey={target.photoKey} size={56} container={target.isContainer} />
				<div class="min-w-0 flex-1">
					<strong class="wrap-anywhere">{target.name}</strong>
					<p class="text-sm break-words text-gray-500 dark:text-gray-400">{target.detail}</p>
				</div>
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
					onclick={() => (target = null)}
					title="Выбрать другое"
					aria-label="Выбрать другое"><CloseOutline class="h-5 w-5" /></button
				>
			</div>
			<StepperField
				label={already ? 'Сколько добавить' : 'Сколько нужно'}
				bind:value={quantity}
				disabled={busy}
			/>
			{#if already}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Уже в коллекции: {pieces(already.quantity)}{valid
						? `, станет ${pieces(already.quantity + quantity)}`
						: ''}
				</p>
			{/if}
			{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
			<Button class="h-11" onclick={add} disabled={busy || !valid}>
				<PlusOutline class="me-1.5 h-5 w-5" />Добавить
			</Button>
		{:else}
			<div class="flex gap-2">
				<div class="min-w-0 flex-1">
					<Input
						type="search"
						bind:value={query}
						placeholder="Название или ID наклейки"
						aria-label="Что добавить"
						autocomplete="off"
						onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && e.preventDefault()}
					/>
				</div>
				<Button
					type="button"
					color="alternative"
					class="h-10 w-10 shrink-0 p-0"
					title={scanning ? 'Закрыть камеру' : 'Сканировать наклейку'}
					aria-label={scanning ? 'Закрыть камеру' : 'Сканировать наклейку'}
					onclick={() => (scanning = !scanning)}><QrCodeOutline class="h-5 w-5" /></Button
				>
			</div>
			{#if scanning}<QrScanner {onscan} active={scanning} />{/if}
			{#if message}<p class="text-sm text-red-600 dark:text-red-500" role="alert">
					{message}
				</p>{/if}
			{#if options.length}
				<ul class="flex flex-col gap-1">
					{#each options as t (t.id)}
						<li>
							<button type="button" class={optionClass} onclick={() => pickType(t)}>
								<Thumb photoKey={t.photoKey} size={36} container={t.isContainer} />
								<span class="min-w-0 flex-1">
									<span class="block font-medium break-words">{t.name}</span>
									<span class="block text-gray-500 dark:text-gray-400">
										{t.total ? `любые такие · есть ${pieces(t.total)}` : 'вещей нет'}
									</span>
								</span>
							</button>
							{#each t.items as item (item.itemId)}
								<button type="button" class="{optionClass} ps-12" onclick={() => pickItem(t, item)}>
									<span class="min-w-0 flex-1">
										<span class="block break-words">
											{item.name}
											{#if item.quantity > 1}
												<span class="text-gray-500 dark:text-gray-400"
													>· {pieces(item.quantity)}</span
												>
											{/if}
										</span>
										<span class="block break-words text-gray-500 dark:text-gray-400">
											{formatPath(item.path) || 'верхний уровень'}
										</span>
									</span>
									{#if item.stickerCode}
										<span class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400"
											>{formatCode(item.stickerCode)}</span
										>
									{/if}
								</button>
							{/each}
						</li>
					{/each}
				</ul>
			{/if}
			{#if query.trim() && !exactType}
				<div>
					<Button color="alternative" class="h-10" onclick={pickNew}>
						<PlusOutline class="me-1 h-4 w-4" />Новый тип «{query.trim()}»
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</Sheet>
