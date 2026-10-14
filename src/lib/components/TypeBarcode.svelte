<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import { formatBarcode } from '$lib/domain/barcode';
	import { confirmAction } from '$lib/confirm.svelte';
	import QrScanner from './QrScanner.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * The sheet of a type's packaging barcode, opened by BarcodeIcon on the type photo: link one (scan or digits), or see it, replace it or unlink it.
	 */
	let {
		typeId,
		barcode,
		open = $bindable(false)
	}: { typeId: string; barcode: string | null; open?: boolean } = $props();

	let scanning = $state(false);
	let error = $state('');

	// Every opening starts over: the scanner right away when there is no barcode yet.
	$effect(() => {
		if (open) {
			error = '';
			scanning = !untrack(() => barcode);
		}
	});

	async function run(action: () => Promise<unknown>) {
		error = '';
		try {
			await action();
			open = false;
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		}
	}

	async function unlink() {
		const ok = await confirmAction({
			title: 'Отвязать штрихкод?',
			message: 'Скан этого штрихкода больше не будет открывать тип.',
			confirmLabel: 'Отвязать'
		});
		if (ok) run(() => api.delete(`/api/types/${typeId}/barcode`));
	}
</script>

<Sheet bind:open title="Штрихкод с упаковки">
	{#if barcode && !scanning}
		<p class="font-mono text-2xl">{formatBarcode(barcode)}</p>
		<div class="mt-4 flex flex-wrap gap-2">
			<Button color="alternative" onclick={() => (scanning = true)}>Заменить</Button>
			<Button color="red" outline onclick={unlink}>Отвязать</Button>
		</div>
	{:else}
		<QrScanner
			onbarcode={(code) => run(() => api.put(`/api/types/${typeId}/barcode`, { code }))}
			active={open && scanning}
			submitLabel="Привязать"
		/>
	{/if}
	{#if error}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</Sheet>
