<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { formatPath } from '$lib/domain/item';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busyId = $state<string | null>(null);
	let error = $state<{ id: string; message: string } | null>(null);

	const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

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

	function purge(item: { id: string; name: string }) {
		const question = `Удалить «${item.name}» навсегда? Это нельзя отменить; всё, что выкинуто вместе с ней, тоже удалится.`;
		if (!confirm(question)) return;
		return act(item.id, () => api.post(`/api/items/${item.id}/purge`));
	}
</script>

<svelte:head><title>Архив — Вещи</title></svelte:head>

<h1>Архив</h1>
<p class="muted">Выкинутые и использованные вещи. Их можно вернуть в каталог.</p>

{#if data.items.length === 0}
	<p class="muted">Архив пуст.</p>
{:else}
	<ul class="list">
		{#each data.items as item (item.id)}
			<li class="card stack">
				<div>
					<a href="/items/{item.id}"><strong>{item.name}</strong></a>
					{#if item.quantity > 1}<span class="badge">{item.quantity} шт.</span>{/if}
					{#if item.stickerCode}<span class="mono muted">{formatCode(item.stickerCode)}</span>{/if}
					<div class="muted">
						{item.path.length ? `Лежала: ${formatPath(item.path)}` : 'Лежала на верхнем уровне'}
						{#if item.archivedAt}· {dateFormat.format(item.archivedAt)}{/if}
					</div>
				</div>
				<div class="row">
					<button class="primary" onclick={() => restore(item.id)} disabled={busyId === item.id}>
						Восстановить
					</button>
					<button class="danger" onclick={() => purge(item)} disabled={busyId === item.id}>
						Удалить навсегда
					</button>
				</div>
				{#if error?.id === item.id}<p class="error" role="alert">{error.message}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
