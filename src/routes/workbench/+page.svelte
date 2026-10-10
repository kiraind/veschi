<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import ContainerPicker from '$lib/components/ContainerPicker.svelte';
	import DiscardDialog from '$lib/components/DiscardDialog.svelte';
	import { Badge, Button, Card } from 'flowbite-svelte';
	import { CogOutline } from 'flowbite-svelte-icons';
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
		<h2 class="mt-6 mb-2 text-lg font-semibold break-words">{bench.name}</h2>
		{#if bench.items.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">Пусто.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each bench.items as item (item.id)}
					<li>
						<Card class="max-w-none space-y-3 p-4">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<a
										href="/items/{item.id}"
										class="min-w-0 font-semibold break-words text-primary-700 hover:underline dark:text-primary-500"
										>{item.name}</a
									>
									{#if item.quantity > 1}<Badge color="gray">{item.quantity} шт.</Badge>{/if}
								</div>
								<div class="mt-1 text-sm break-words text-gray-500 dark:text-gray-400">
									Откуда: {item.homePath.length ? formatPath(item.homePath) : 'верхний уровень'}
									{#if item.takenByName}· достал(а) {item.takenByName}{/if}
								</div>
							</div>

							<div class="flex flex-wrap gap-2">
								<Button
									onclick={() => returnHome(item.id)}
									disabled={!item.canReturn || busyId === item.id}
								>
									Вернуть на место
								</Button>
								<Button
									color="alternative"
									onclick={() => (relocatingId = relocatingId === item.id ? null : item.id)}
									disabled={busyId === item.id}
								>
									Положить в другое место
								</Button>
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
