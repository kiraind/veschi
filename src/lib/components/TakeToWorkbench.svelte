<script lang="ts" module>
	import type { GeoPoint } from '$lib/domain/workbench';

	// The position is asked once per page load: a second prompt or wait would only annoy.
	let positionRequest: Promise<GeoPoint | null> | null = null;

	function currentPosition(): Promise<GeoPoint | null> {
		positionRequest ??= new Promise((resolve) => {
			if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
			navigator.geolocation.getCurrentPosition(
				(p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
				() => resolve(null),
				{ timeout: 5000, maximumAge: 5 * 60_000 }
			);
		});
		return positionRequest;
	}
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { pickWorkbench, quantityError } from '$lib/domain/workbench';

	interface Bench {
		id: string;
		name: string;
		geoLat: number | null;
		geoLng: number | null;
		geoRadiusM: number | null;
	}

	let { item }: { item: { id: string; quantity: number; name: string } } = $props();

	let open = $state(false);
	let loading = $state(false);
	let busy = $state(false);
	let error = $state('');
	let benches = $state<Bench[]>([]);
	let selectedId = $state<string | null>(null);
	let quantity = $state(1);

	const selected = $derived(benches.find((b) => b.id === selectedId) ?? null);
	const quantityProblem = $derived(quantityError(item.quantity, quantity));

	async function start() {
		open = true;
		loading = true;
		error = '';
		quantity = item.quantity;
		try {
			const data = await api.get<{ workbenches: Bench[]; lastWorkbenchId: string | null }>(
				'/api/workbenches'
			);
			benches = data.workbenches;
			const hasZones = benches.some((b) => b.geoRadiusM !== null);
			const position = hasZones ? await currentPosition() : null;
			selectedId = pickWorkbench(benches, position, data.lastWorkbenchId);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	async function confirm() {
		if (!selectedId || quantityProblem) return;
		busy = true;
		error = '';
		try {
			await api.post(`/api/items/${item.id}/take`, { workbenchId: selectedId, quantity });
			open = false;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if !open}
	<button class="primary" onclick={start}>На стол</button>
{:else}
	<div class="card stack">
		{#if loading}
			<p class="muted">Выбираю стол…</p>
		{:else if benches.length === 0}
			<p>Рабочих столов пока нет.</p>
			<div class="row">
				<a class="button primary" href="/workbench/settings">Создать рабочий стол</a>
				<button onclick={() => (open = false)}>Отмена</button>
			</div>
		{:else}
			<p class="target">
				{item.name} → <span class="highlight">{selected?.name ?? '?'}</span>
			</p>
			{#if benches.length > 1}
				<div class="row" role="radiogroup" aria-label="Рабочий стол">
					{#each benches as bench (bench.id)}
						<label class="choice">
							<input type="radio" name="bench-{item.id}" value={bench.id} bind:group={selectedId} />
							{bench.name}
						</label>
					{/each}
				</div>
			{/if}
			{#if item.quantity > 1}
				<label>
					Сколько достать (из {item.quantity})
					<input type="number" min="1" max={item.quantity} step="1" bind:value={quantity} />
				</label>
				{#if quantityProblem}<p class="error">{quantityProblem}</p>{/if}
			{/if}
			<div class="row">
				<button
					class="primary"
					onclick={confirm}
					disabled={busy || !selectedId || !!quantityProblem}
				>
					Достать
				</button>
				<button onclick={() => (open = false)} disabled={busy}>Отмена</button>
			</div>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
{/if}

<style>
	.target {
		margin: 0;
		font-size: 1.1rem;
	}
	.choice {
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		color: var(--text);
		font-size: 1rem;
	}
</style>
