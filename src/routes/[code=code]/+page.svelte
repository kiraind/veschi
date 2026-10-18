<script lang="ts">
	import BackTrail from '$lib/components/BackTrail.svelte';
	import { Button, Card } from 'flowbite-svelte';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const result = $derived(data.result);
	const code = $derived(result.code ? formatCode(result.code) : '');
</script>

<svelte:head><title>Наклейка {code} — veschi</title></svelte:head>

<BackTrail />

{#if result.status === 'written_off'}
	<h1 class="mb-3 text-2xl font-bold">Наклейка списана</h1>
	<Card class="max-w-none gap-3 p-4">
		<p>
			Наклейка <span class="font-mono">{code}</span>{result.caption ? ` «${result.caption}»` : ''} больше
			не используется.
		</p>
		{#if result.itemId}
			<p><a href="/items/{result.itemId}">Вещь в архиве</a></p>
		{/if}
	</Card>
{:else}
	<h1 class="mb-3 text-2xl font-bold">Такой наклейки нет</h1>
	<Card class="max-w-none gap-3 p-4">
		<p>Наклейки <span class="font-mono">{code}</span> нет в каталоге.</p>
		{#if result.status === 'unknown' && result.suggestion}
			<p>
				Возможно, <a
					class="font-mono text-primary-700 hover:underline dark:text-primary-400"
					href="/{result.suggestion.replace('-', '')}">{result.suggestion}</a
				>?
			</p>
		{/if}
	</Card>
{/if}

<div class="mt-4">
	<Button href="/scan" color="alternative">Сканировать другую</Button>
</div>
