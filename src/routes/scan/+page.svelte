<script lang="ts">
	import { goto } from '$app/navigation';
	import QrScanner from '$lib/components/QrScanner.svelte';
</script>

<svelte:head><title>Скан</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Сканировать</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Наведите камеру на QR-код наклейки или штрихкод на упаковке, или введите ID либо цифры штрихкода.
</p>

<QrScanner onscan={(code) => goto(`/${code}`)} onbarcode={(code) => goto(`/barcode/${code}`)} />
