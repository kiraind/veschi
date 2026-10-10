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
	import { Button, Card, Radio } from 'flowbite-svelte';
	import { api } from '$lib/api';
	import { pickWorkbench, quantityError } from '$lib/domain/workbench';
	import QuantityField from './QuantityField.svelte';
	import WorkbenchIcon from './WorkbenchIcon.svelte';

	interface Bench {
		id: string;
		name: string;
		geoLat: number | null;
		geoLng: number | null;
		geoRadiusM: number | null;
		icon: string | null;
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
	<Button onclick={start}>На стол</Button>
{:else}
	<Card class="max-w-none gap-3 p-4">
		{#if loading}
			<p class="text-sm text-gray-500 dark:text-gray-400">Выбираю стол…</p>
		{:else if benches.length === 0}
			<p>Рабочих столов пока нет.</p>
			<div class="flex flex-wrap gap-2">
				<Button href="/workbench/settings">Создать рабочий стол</Button>
				<Button color="alternative" onclick={() => (open = false)}>Отмена</Button>
			</div>
		{:else}
			<p class="text-lg wrap-anywhere">
				{item.name} →
				<span class="rounded bg-yellow-100 px-1 dark:bg-yellow-900/50"
					>{#if selected}<WorkbenchIcon
							icon={selected.icon}
							class="me-1 inline h-5 w-5 align-[-0.2em]"
						/>{/if}{selected?.name ?? '?'}</span
				>
			</p>
			{#if benches.length > 1}
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Рабочий стол">
					{#each benches as bench (bench.id)}
						<Radio
							name="bench-{item.id}"
							value={bench.id}
							bind:group={selectedId}
							classes={{
								label:
									'min-h-10 cursor-pointer rounded-lg border border-gray-200 px-3 text-base font-normal text-gray-900 dark:border-gray-700 dark:text-white'
							}}
						>
							<WorkbenchIcon icon={bench.icon} class="me-1.5 h-5 w-5" />{bench.name}
						</Radio>
					{/each}
				</div>
			{/if}
			{#if item.quantity > 1}
				<QuantityField available={item.quantity} bind:value={quantity} label="Сколько достать" />
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button onclick={confirm} disabled={busy || !selectedId || !!quantityProblem}
					>Достать</Button
				>
				<Button color="alternative" onclick={() => (open = false)} disabled={busy}>Отмена</Button>
			</div>
		{/if}
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</Card>
{/if}
