<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import QrScanner from './QrScanner.svelte';
	import type { ItemCard } from '$lib/server/services/items';
	import type { SearchGroup } from '$lib/server/services/search';

	/** Choose a container: search active items or scan the container's sticker. */
	let {
		onpick,
		excludeId,
		title = 'Куда положить?'
	}: {
		onpick: (container: { id: string; name: string }) => void;
		excludeId?: string;
		title?: string;
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
				.filter((l) => l.itemId !== excludeId)
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
			scanning = false;
			onpick({ id: card.item.id, name: card.item.displayName });
		} catch (e) {
			message = e instanceof ApiError ? e.message : String(e);
		}
	}
</script>

<div class="card stack picker">
	<strong>{title}</strong>
	<div class="row">
		<input
			class="search"
			type="search"
			bind:value={query}
			placeholder="Найти контейнер по названию"
			aria-label="Найти контейнер"
		/>
		<button type="button" onclick={() => (scanning = !scanning)}>
			{scanning ? 'Закрыть камеру' : 'Сканировать'}
		</button>
	</div>
	{#if scanning}
		<QrScanner {onscan} active={scanning} />
	{/if}
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	{#if results.length > 0}
		<ul class="list">
			{#each results as result (result.id)}
				<li>
					<button type="button" class="result" onclick={() => onpick(result)}>
						<span>{result.name}</span>
						{#if result.path}<span class="muted">{result.path}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if query.trim()}
		<p class="muted">Ничего не найдено.</p>
	{/if}
</div>

<style>
	.search {
		flex: 1;
		min-width: 10rem;
	}
	.result {
		width: 100%;
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
		text-align: left;
	}
</style>
