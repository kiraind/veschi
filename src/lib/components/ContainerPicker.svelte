<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { Button, Card, Input } from 'flowbite-svelte';
	import { QrCodeOutline } from 'flowbite-svelte-icons';
	import QrScanner from './QrScanner.svelte';
	import type { ItemCard } from '$lib/server/services/items';
	import type { SearchGroup } from '$lib/server/services/search';

	/**
	 * Choose a container (or, with `containersOnly = false`, any item): search
	 * active items or scan a sticker.
	 */
	let {
		onpick,
		excludeId,
		title = 'Куда положить?',
		containersOnly = true
	}: {
		onpick: (container: { id: string; name: string }) => void;
		excludeId?: string;
		title?: string;
		containersOnly?: boolean;
	} = $props();

	let query = $state('');
	let results = $state<{ id: string; name: string; path: string }[]>([]);
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
			const groups = await api.get<SearchGroup[]>(`/api/search?q=${encodeURIComponent(q)}`);
			if (id !== request) return;
			results = groups
				.flatMap((g) => g.locations)
				.filter((l) => l.itemId !== excludeId && (!containersOnly || l.isContainer))
				.map((l) => ({ id: l.itemId, name: l.name, path: formatPath(l.path) }));
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
			const card = await api.get<ItemCard>(`/api/items/${resolved.itemId}`);
			if (containersOnly && !card.item.isContainer) {
				message = `«${card.item.displayName}» — не контейнер`;
				return;
			}
			scanning = false;
			onpick({ id: card.item.id, name: card.item.displayName });
		} catch (e) {
			message = e instanceof ApiError ? e.message : String(e);
		}
	}
</script>

<Card class="max-w-none space-y-3 p-4">
	<p class="font-medium">{title}</p>
	<div class="flex flex-wrap gap-2">
		<Input
			class="min-w-40 flex-1"
			type="search"
			bind:value={query}
			placeholder={containersOnly ? 'Найти контейнер по названию' : 'Найти вещь по названию'}
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
		<ul
			class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
		>
			{#each results as result (result.id)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
						onclick={() => onpick(result)}
					>
						<span class="break-words">{result.name}</span>
						{#if result.path}
							<span class="text-sm text-gray-500 dark:text-gray-400">{result.path}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if query.trim()}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{containersOnly ? 'Контейнеров не найдено.' : 'Ничего не найдено.'}
		</p>
	{/if}
</Card>
