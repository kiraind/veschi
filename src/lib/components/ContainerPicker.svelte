<script lang="ts">
	import { api, errorText } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import { Button, Card, Input } from 'flowbite-svelte';
	import { QrCodeOutline } from 'flowbite-svelte-icons';
	import QrScanner from './QrScanner.svelte';
	import type { ItemCard } from '$lib/server/services/items';
	import type { SearchGroup } from '$lib/server/services/search';
	import type { PlaceSuggestion } from '$lib/server/services/places';

	/**
	 * Choose a container (or, with `containersOnly = false`, any item): search
	 * active items or scan a sticker.
	 */
	let {
		onpick,
		excludeId,
		excludeIds = [],
		excludeParentId,
		title = 'Куда положить?',
		containersOnly = true,
		card = true,
		suggestFor
	}: {
		onpick: (container: { id: string; name: string }) => void;
		/** The item being placed: it cannot go into itself (nor, when choosing a container, into its own contents). */
		excludeId?: string;
		/** Containers not offered, e.g. the one the item already lies in. */
		excludeIds?: string[];
		/** Items lying directly in this container are not offered (they are there already). */
		excludeParentId?: string;
		title?: string;
		containersOnly?: boolean;
		/** In a card of its own; false inside a sheet. */
		card?: boolean;
		/** The item being moved: while nothing is typed, recent and neighbouring places are offered. */
		suggestFor?: string;
	} = $props();

	type Result = { id: string; name: string; path: string; code: string | null };
	let suggestions = $state<{ recent: Result[]; nearby: Result[] } | null>(null);

	$effect(() => {
		if (!suggestFor) return;
		const toResult = (s: PlaceSuggestion): Result => ({
			id: s.itemId,
			name: s.name,
			path: formatPath(s.path),
			code: s.stickerCode
		});
		let stale = false;
		api
			.get<{ recent: PlaceSuggestion[]; nearby: PlaceSuggestion[] }>(
				`/api/items/${suggestFor}/places`
			)
			.then((found) => {
				if (stale) return;
				const offered = (s: PlaceSuggestion) => !excludeIds.includes(s.itemId);
				suggestions = {
					recent: found.recent.filter(offered).map(toResult),
					nearby: found.nearby.filter(offered).map(toResult)
				};
			})
			// Only a convenience: without it the field works as before.
			.catch(() => {});
		return () => (stale = true);
	});

	let query = $state('');
	let results = $state<Result[]>([]);
	let scanning = $state(false);
	let message = $state('');
	let request = 0;

	$effect(() => {
		const q = query.trim();
		if (!q) {
			results = [];
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			let groups: SearchGroup[];
			try {
				groups = await api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`);
			} catch (e) {
				if (id !== request) return;
				results = [];
				message = errorText(e, 'Не удалось выполнить поиск');
				return;
			}
			if (id !== request) return;
			message = '';
			results = groups
				.flatMap((g) => g.locations)
				.filter(
					(l) =>
						l.itemId !== excludeId &&
						!(containersOnly && excludeId && l.path.some((p) => p.id === excludeId)) &&
						!excludeIds.includes(l.itemId) &&
						(!excludeParentId || l.path.at(-1)?.id !== excludeParentId) &&
						(!containersOnly || l.isContainer)
				)
				.map((l) => ({
					id: l.itemId,
					name: l.name,
					path: formatPath(l.path),
					code: l.stickerCode
				}));
		}, 250);
		return () => clearTimeout(timer);
	});

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
			if (resolved.itemId === excludeId) {
				message = 'Нельзя положить вещь в саму себя';
				return;
			}
			if (excludeIds.includes(resolved.itemId)) {
				message = 'Вещь уже лежит в этом контейнере';
				return;
			}
			const card = await api.get<ItemCard>(`/api/items/${resolved.itemId}`);
			if (excludeParentId && card.item.parentId === excludeParentId && !card.item.takenById) {
				message = `«${card.item.displayName}» уже лежит здесь`;
				return;
			}
			if (containersOnly && excludeId && card.path.some((p) => p.id === excludeId)) {
				message = `«${card.item.displayName}» лежит внутри перекладываемой вещи`;
				return;
			}
			if (containersOnly && !card.item.isContainer) {
				message = `«${card.item.displayName}» — не контейнер`;
				return;
			}
			scanning = false;
			onpick({ id: card.item.id, name: card.item.displayName });
		} catch (e) {
			message = errorText(e);
		}
	}
</script>

{#snippet list(items: Result[])}
	<ul
		class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
	>
		{#each items as result (result.id)}
			<li>
				<button
					type="button"
					class="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
					onclick={() => onpick(result)}
				>
					<span class="break-words"
						>{result.name}{#if result.code}<span
								class="ms-2 font-mono text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
								>{formatCode(result.code)}</span
							>{/if}</span
					>
					{#if result.path}
						<span class="text-sm text-gray-500 dark:text-gray-400">{result.path}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet picker()}
	<p class="font-medium">{title}</p>
	<div class="flex flex-wrap gap-2">
		<Input
			class="min-w-40 flex-1"
			type="search"
			bind:value={query}
			onkeydown={(e: KeyboardEvent) => {
				// The picker may sit inside a form («Новая вещь»): Enter searches, it does not submit.
				if (e.key === 'Enter') e.preventDefault();
			}}
			placeholder={containersOnly
				? 'Название контейнера или ID наклейки'
				: 'Название вещи или ID наклейки'}
			aria-label={containersOnly ? 'Найти контейнер' : 'Найти вещь'}
		/>
		<Button type="button" color="alternative" onclick={() => (scanning = !scanning)}>
			<QrCodeOutline class="me-1.5 h-5 w-5" />
			{scanning ? 'Закрыть камеру' : 'Сканировать'}
		</Button>
	</div>
	{#if scanning}
		<QrScanner {onscan} active={scanning} />
	{/if}
	{#if message}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{message}</p>{/if}
	{#if results.length > 0}
		{@render list(results)}
	{:else if !query.trim() && suggestions && !scanning}
		{#if suggestions.recent.length}
			<p class="text-sm text-gray-500 dark:text-gray-400">Недавние</p>
			{@render list(suggestions.recent)}
		{/if}
		{#if suggestions.nearby.length}
			<p class="text-sm text-gray-500 dark:text-gray-400">Рядом</p>
			{@render list(suggestions.nearby)}
		{/if}
	{:else if query.trim()}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{containersOnly ? 'Контейнеров не найдено.' : 'Ничего не найдено.'}
		</p>
	{/if}
{/snippet}

{#if card}
	<Card class="max-w-none space-y-3 p-4">{@render picker()}</Card>
{:else}
	<div class="space-y-3">{@render picker()}</div>
{/if}
