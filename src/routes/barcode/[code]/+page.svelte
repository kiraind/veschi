<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Card } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { formatBarcode } from '$lib/domain/barcode';
	import TypeAutocomplete from '$lib/components/TypeAutocomplete.svelte';
	import type { TypeInfo } from '$lib/server/services/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const result = $derived(data.result);
	const code = $derived(result.status === 'unknown' ? result.code : '');

	let typeId = $state<string | null>(null);
	let typeName = $state('');
	let selected = $state<TypeInfo | null>(null);
	let busy = $state(false);
	let error = $state('');

	async function link(event: SubmitEvent) {
		event.preventDefault();
		if (!typeId) return;
		busy = true;
		error = '';
		try {
			await api.post(`/api/types/${typeId}/barcode`, { code });
			await goto(`/types/${typeId}`, { replaceState: true });
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Штрихкод {code ? formatBarcode(code) : data.input}</title></svelte:head>

{#if result.status === 'unknown'}
	<h1 class="mb-3 text-2xl font-bold">Новый штрихкод</h1>
	<p class="mb-4">
		Штрихкода <span class="font-mono whitespace-nowrap">{formatBarcode(code)}</span> ещё нет в каталоге.
		Привяжите его к типу — в следующий раз скан сразу откроет этот тип.
	</p>

	<Button href="/items/new?barcode={code}" class="h-12 w-full sm:w-auto">
		<PlusOutline class="me-2 h-5 w-5" />Новая вещь с этим штрихкодом
	</Button>

	<Card class="mt-6 max-w-none p-4">
		<h2 class="mb-3 text-lg font-semibold">Или привязать к типу</h2>
		<form class="flex flex-col gap-3" onsubmit={link}>
			<TypeAutocomplete bind:typeId bind:typeName bind:selected allowNew={false} />
			{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
			<div>
				<Button type="submit" color="alternative" disabled={busy || !typeId} loading={busy}>
					Привязать
				</Button>
			</div>
		</form>
	</Card>
{:else}
	<h1 class="mb-3 text-2xl font-bold">Это не штрихкод товара</h1>
	<Card class="max-w-none p-4">
		<p>
			<span class="font-mono wrap-anywhere">{data.input}</span> — не штрихкод с упаковки: у него 8, 12,
			13 или 14 цифр, и последняя сходится с остальными.
		</p>
	</Card>
{/if}

<div class="mt-4">
	<Button href="/scan" color="alternative">Сканировать другой</Button>
</div>
