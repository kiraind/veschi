<script lang="ts">
	import { ChevronRightOutline, ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { inCategories, type RequiredParam } from '$lib/domain/categories';

	/**
	 * At the top of an item or type card: required values not filled yet, in
	 * the look of the notices on the search page. A tap opens the first one.
	 */
	let { missing, onfill }: { missing: RequiredParam[]; onfill: (r: RequiredParam) => void } =
		$props();

	const first = $derived(missing[0]);
	const names = $derived(missing.map((r) => `«${r.def.name}»`).join(', '));
	const categories = $derived([
		...new Map(missing.flatMap((r) => r.categories).map((c) => [c.id, c])).values()
	]);
</script>

{#if first}
	<button
		type="button"
		class="mb-4 flex min-h-14 w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-xs hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
		onclick={() => onfill(first)}
	>
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400/80"
		>
			<ExclamationCircleOutline class="h-5 w-5" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block font-medium wrap-anywhere text-gray-900 dark:text-white"
				>{missing.length > 1 ? 'Не заполнены параметры' : 'Не заполнен параметр'} {names}</span
			>
			<span class="block text-sm text-gray-500 dark:text-gray-400"
				>{missing.length > 1 ? 'Обязательны' : 'Обязателен'} {inCategories(categories)}</span
			>
		</span>
		<ChevronRightOutline class="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
	</button>
{/if}
