<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Helper } from 'flowbite-svelte';
	import { CloseOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { formatBarcode } from '$lib/domain/barcode';
	import { confirmAction } from '$lib/confirm.svelte';
	import QrScanner from './QrScanner.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * Packaging barcodes of a type on its card: a chip per barcode (cross to
	 * unlink) and «Штрихкод», which scans or takes typed digits.
	 */
	let { typeId, barcodes }: { typeId: string; barcodes: string[] } = $props();

	let adding = $state(false);
	let addError = $state('');
	let error = $state('');

	async function add(code: string) {
		addError = '';
		try {
			await api.post(`/api/types/${typeId}/barcodes`, { code });
			adding = false;
			await invalidateAll();
		} catch (e) {
			addError = errorText(e);
		}
	}

	async function remove(code: string) {
		const ok = await confirmAction({
			title: `Отвязать штрихкод ${formatBarcode(code)}?`,
			message: 'Скан этого штрихкода больше не будет открывать тип.',
			confirmLabel: 'Отвязать'
		});
		if (!ok) return;
		error = '';
		try {
			await api.delete(`/api/types/${typeId}/barcodes/${code}`);
			await invalidateAll();
		} catch (e) {
			error = errorText(e);
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#each barcodes as code (code)}
		<span
			class="inline-flex h-10 items-center rounded-lg bg-gray-100 ps-3 font-mono text-sm text-gray-900 dark:bg-gray-700 dark:text-white"
		>
			{formatBarcode(code)}
			<button
				type="button"
				class="flex h-10 w-9 items-center justify-center rounded-e-lg hover:bg-gray-200 dark:hover:bg-gray-600"
				title="Отвязать штрихкод"
				aria-label="Отвязать штрихкод {formatBarcode(code)}"
				onclick={() => remove(code)}><CloseOutline class="h-4 w-4" /></button
			>
		</span>
	{/each}
	<Button
		color="alternative"
		size="sm"
		class="h-10"
		onclick={() => {
			addError = '';
			adding = true;
		}}
	>
		<PlusOutline class="me-1 h-4 w-4" />Штрихкод
	</Button>
</div>
{#if barcodes.length === 0}
	<Helper class="mt-2">
		Штрихкод с упаковки: после привязки скан на вкладке «Скан» сразу откроет этот тип.
	</Helper>
{/if}
{#if error}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}

<Sheet bind:open={adding} title="Штрихкод с упаковки">
	<QrScanner onbarcode={add} active={adding} submitLabel="Привязать" />
	{#if addError}<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">
			{addError}
		</p>{/if}
</Sheet>
