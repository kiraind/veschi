<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { archivedToast } from '$lib/item-toasts';
	import { pieces, plural } from '$lib/domain/plural';
	import DiscardContents, { type Contents } from './DiscardContents.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * «Выкинуть» of a container with something inside: asks what to do with the
	 * contents first. An empty container is thrown away after a plain confirmation.
	 */
	let {
		open = $bindable(false),
		item,
		parent,
		inside,
		ondiscarded
	}: {
		open?: boolean;
		item: { id: string; name: string };
		/** Where the container lies; null — the top level. */
		parent: { name: string; isWorkbench: boolean } | null;
		/** What lies directly in it. */
		inside: { name: string; quantity: number }[];
		/** Called after the container went to the archive (the page may be gone). */
		ondiscarded: () => Promise<void>;
	} = $props();

	/** How many things and which: the first few by name; «(100 штук)» is not broken. */
	const SHOWN = 3;
	const insideText = $derived(
		`Внутри ${inside.length} ${plural(inside.length, ['вещь', 'вещи', 'вещей'])}: ` +
			inside
				.slice(0, SHOWN)
				.map((e) =>
					e.quantity > 1 ? `${e.name}\u00a0(${pieces(e.quantity).replace(' ', '\u00a0')})` : e.name
				)
				.join(', ') +
			(inside.length > SHOWN ? ` и ещё ${inside.length - SHOWN}` : '')
	);
	const parentLabel = $derived(
		!parent
			? 'Переложить на верхний уровень'
			: parent.isWorkbench
				? `Переложить на стол «${parent.name}»`
				: `Переложить в «${parent.name}»`
	);

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
		// After ondiscarded the page (and `item`) may show another item.
		const { id, name } = item;
		try {
			await api.post(`/api/items/${id}/discard`, {
				contents,
				workbenchId: contents === 'workbench' ? (workbenchId ?? undefined) : undefined
			});
			open = false;
			await ondiscarded();
			archivedToast(`Выкинули «${name}»`, id);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title="Выкинуть «{item.name}»?">
	<div class="flex flex-col gap-4">
		<p class="text-gray-500 dark:text-gray-400">{insideText}</p>
		<DiscardContents bind:contents bind:workbenchId {parentLabel} />
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
