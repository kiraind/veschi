<script lang="ts">
	import { BarcodeOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { formatBarcode } from '$lib/domain/barcode';

	/**
	 * A round barcode button on a type's photo, above the photo menu button and
	 * shaped like it; grey with a plus when the type has no packaging barcode.
	 */
	let { barcode, onclick }: { barcode: string | null; onclick: () => void } = $props();

	const label = $derived(barcode ? `Штрихкод ${formatBarcode(barcode)}` : 'Привязать штрихкод');
</script>

<!-- Same shape as the photo menu button under it (PhotoField). -->
<button
	type="button"
	class="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow hover:bg-white focus:ring-4 focus:ring-primary-300 focus:outline-none dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700 dark:focus:ring-primary-800 {barcode
		? 'text-gray-700 dark:text-gray-200'
		: 'text-gray-400 dark:text-gray-500'}"
	aria-label={label}
	title={label}
	{onclick}
>
	<BarcodeOutline class="h-5 w-5" />
	{#if !barcode}<PlusOutline class="absolute end-1.5 top-1.5 h-3 w-3" strokeWidth="3" />{/if}
</button>
