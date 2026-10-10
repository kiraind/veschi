<script lang="ts">
	import { formatIsoDateTime } from '$lib/domain/dates';
	import { invalidateAll } from '$app/navigation';
	import { Badge, Button, Card } from 'flowbite-svelte';
	import { api } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { PageData } from './$types';
	import { confirmAction } from '$lib/confirm.svelte';

	let { data }: { data: PageData } = $props();

	let busyId = $state<string | null>(null);
	let error = $state<{ id: string; message: string } | null>(null);

	async function act(id: string, action: () => Promise<unknown>) {
		busyId = id;
		error = null;
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = { id, message: e instanceof Error ? e.message : String(e) };
		} finally {
			busyId = null;
		}
	}

	const restore = (id: string) => act(id, () => api.post(`/api/items/${id}/restore`));

	async function purge(item: { id: string; name: string }) {
		const ok = await confirmAction({
			title: `Удалить «${item.name}» навсегда?`,
			message: 'Это нельзя отменить; всё, что выкинуто вместе с ней, тоже удалится.',
			confirmLabel: 'Удалить навсегда'
		});
		if (!ok) return;
		return act(item.id, () => api.post(`/api/items/${item.id}/purge`));
	}
</script>

<svelte:head><title>Архив — Вещи</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Архив</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Выкинутые и использованные вещи. Их можно вернуть в каталог.
</p>

{#if data.items.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Архив пуст.</p>
{:else}
	<ul class="flex flex-col gap-3">
		{#each data.items as item (item.id)}
			<li>
				<Card class="max-w-none gap-3 p-4">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<a
								href="/items/{item.id}"
								class="text-primary-700 wrap-anywhere hover:underline dark:text-primary-400"
								><strong>{item.name}</strong></a
							>
							{#if item.quantity > 1}<Badge color="gray" class="dark:bg-gray-700 dark:text-gray-200"
									>{item.quantity} шт.</Badge
								>{/if}
							{#if item.stickerCode}<span class="font-mono text-sm text-gray-500 dark:text-gray-400"
									>{formatCode(item.stickerCode)}</span
								>{/if}
						</div>
						<div class="mt-1 text-sm wrap-anywhere text-gray-500 dark:text-gray-400">
							{item.path.length ? `Лежала: ${formatPath(item.path)}` : 'Лежала на верхнем уровне'}
							{#if item.archivedAt}· {formatIsoDateTime(item.archivedAt)}{/if}
						</div>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button size="sm" onclick={() => restore(item.id)} disabled={busyId === item.id}>
							Восстановить
						</Button>
						<Button
							size="sm"
							color="red"
							outline
							onclick={() => purge(item)}
							disabled={busyId === item.id}
						>
							Удалить навсегда
						</Button>
					</div>
					{#if error?.id === item.id}
						<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error.message}</p>
					{/if}
				</Card>
			</li>
		{/each}
	</ul>
{/if}
