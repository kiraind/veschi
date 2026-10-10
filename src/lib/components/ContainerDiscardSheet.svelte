<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { api, ApiError } from '$lib/api';
	import DiscardContents, { type Contents } from './DiscardContents.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «Выкинуть» of a container with something inside: asks what to do with the
	 * contents first. An empty container is thrown away after a plain confirmation.
	 */
	let {
		open = $bindable(false),
		item,
		ondiscarded
	}: {
		open?: boolean;
		item: { id: string; name: string };
		/** Called after the container went to the archive (the page may be gone). */
		ondiscarded: () => Promise<void>;
	} = $props();

	let contents = $state<Contents>('parent');
	let workbenchId = $state<string | null>(null);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open) {
			contents = 'parent';
			error = '';
		}
	});

	async function discard() {
		busy = true;
		error = '';
		try {
			await api.post(`/api/items/${item.id}/discard`, {
				contents,
				workbenchId: contents === 'workbench' ? (workbenchId ?? undefined) : undefined
			});
			open = false;
			await ondiscarded();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title="Выкинуть «{item.name}»?">
	<div class="flex flex-col gap-4">
		<DiscardContents bind:contents bind:workbenchId />
		<div class="flex flex-wrap gap-2">
			<Button
				color="red"
				onclick={discard}
				disabled={busy || (contents === 'workbench' && !workbenchId)}
				loading={busy}>Выкинуть</Button
			>
			<Button color="alternative" onclick={() => (open = false)} disabled={busy}>Отмена</Button>
		</div>
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Выкинутый контейнер попадёт в архив, оттуда его можно вернуть.
		</p>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</div>
</Sheet>
