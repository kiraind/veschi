<script lang="ts">
	import { BarcodeOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { formatBarcode } from '$lib/domain/barcode';

	/**
	 * A small barcode icon next to a type name: coloured when the type has a
	 * packaging barcode, grey with a plus when it has none.
	 */
	let { barcode, onclick }: { barcode: string | null; onclick: () => void } = $props();

	const label = $derived(barcode ? `Штрихкод ${formatBarcode(barcode)}` : 'Привязать штрихкод');
</script>

<!-- Same 40 px tap area as the pen next to it. -->
<button
	type="button"
	class="relative -my-2 inline-flex h-10 w-9 items-center justify-center rounded-lg align-middle focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:focus-visible:ring-primary-800 {barcode
		? 'text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300'
		: 'text-gray-300 hover:text-primary-700 dark:text-gray-600 dark:hover:text-primary-400'}"
	aria-label={label}
	title={label}
	{onclick}
>
	<BarcodeOutline class="h-5 w-5" />
	{#if !barcode}<PlusOutline
			class="absolute end-1 top-1.5 h-3 w-3 rounded-full bg-gray-50 dark:bg-gray-900"
			strokeWidth="3"
		/>{/if}
</button>
