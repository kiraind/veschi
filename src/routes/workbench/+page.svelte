<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import DiscardDialog from '$lib/components/DiscardDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const benches = $derived(
		data.workbenches.map((bench) => ({
			...bench,
			items: data.items.filter((i) => i.workbenchId === bench.id)
		}))
	);

	let relocatingId = $state<string | null>(null);
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

	const returnHome = (id: string) => act(id, () => api.post(`/api/items/${id}/return`));

	const relocate = (id: string, containerId: string) =>
		act(id, () => api.post(`/api/items/${id}/relocate`, { containerId }));
</script>

<svelte:head><title>Рабочий стол — Вещи</title></svelte:head>

<div class="row heading">
	<h1>Рабочий стол</h1>
	<a href="/workbench/settings">Настроить столы</a>
</div>

{#if benches.length === 0}
	<div class="card stack">
		<p>Рабочих столов пока нет. Стол — место для вещей, которые вы достали и используете.</p>
		<a class="button primary" href="/workbench/settings">Создать рабочий стол</a>
	</div>
{/if}

{#each benches as bench (bench.id)}
	<section>
		<h2>{bench.name}</h2>
		{#if bench.items.length === 0}
			<p class="muted">Пусто.</p>
		{:else}
			<ul class="list">
				{#each bench.items as item (item.id)}
					<li class="card stack">
						<div>
							<a href="/items/{item.id}"><strong>{item.name}</strong></a>
							{#if item.quantity > 1}<span class="badge">{item.quantity} шт.</span>{/if}
							<div class="muted">
								Откуда: {item.homePath.length ? formatPath(item.homePath) : 'верхний уровень'}
								{#if item.takenByName}· достал(а) {item.takenByName}{/if}
							</div>
						</div>

						<div class="row">
							<button
								class="primary"
								onclick={() => returnHome(item.id)}
								disabled={!item.canReturn || busyId === item.id}
							>
								Вернуть на место
							</button>
							<button
								onclick={() => (relocatingId = relocatingId === item.id ? null : item.id)}
								disabled={busyId === item.id}
							>
								Положить в другое место
							</button>
						</div>
						{#if !item.canReturn}
							<p class="muted">
								{item.returnBlockedReason}. Положите вещь в другое место.
							</p>
						{/if}

						{#if relocatingId === item.id}
							<ContainerPicker
								title="Куда положить «{item.name}»?"
								excludeId={item.id}
								onpick={(container: { id: string }) => relocate(item.id, container.id)}
							/>
						{/if}

						<DiscardDialog
							item={{
								id: item.id,
								name: item.name,
								quantity: item.quantity,
								hasChildren: item.hasChildren
							}}
						/>

						{#if error?.id === item.id}<p class="error" role="alert">{error.message}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}

<style>
	.heading {
		justify-content: space-between;
	}
	.heading h1 {
		margin-bottom: 0.5rem;
	}
</style>
