<script lang="ts">
	import { goto } from '$app/navigation';
	import QrScanner from '$lib/components/QrScanner.svelte';
</script>

<svelte:head><title>Скан</title></svelte:head>

<h1>Сканировать наклейку</h1>
<p class="muted">Наведите камеру на QR-код или введите ID с наклейки.</p>

<QrScanner onscan={(code) => goto(`/${code}`)} />
