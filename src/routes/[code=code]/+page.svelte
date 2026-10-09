<script lang="ts">
	import { formatCode } from '$lib/domain/sticker-code';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const result = $derived(data.result);
	const code = $derived(result.code ? formatCode(result.code) : '');
</script>

<svelte:head><title>Наклейка {code}</title></svelte:head>

{#if result.status === 'written_off'}
	<h1>Наклейка списана</h1>
	<div class="card stack">
		<p>
			Наклейка <span class="mono">{code}</span>{#if result.caption}
				«{result.caption}»{/if} больше не используется.
		</p>
		{#if result.itemId}
			<a href="/items/{result.itemId}">Вещь в архиве</a>
		{/if}
	</div>
{:else}
	<h1>Такой наклейки нет</h1>
	<div class="card stack">
		<p>Наклейки <span class="mono">{code}</span> нет в каталоге.</p>
		{#if result.status === 'unknown' && result.suggestion}
			<p>
				Возможно, <a class="mono" href="/{result.suggestion.replace('-', '')}"
					>{result.suggestion}</a
				>?
			</p>
		{/if}
	</div>
{/if}

<p><a href="/scan">Сканировать другую</a></p>
