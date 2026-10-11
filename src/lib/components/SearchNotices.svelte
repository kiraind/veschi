<script lang="ts">
	import { ChevronRightOutline, ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { incompleteOwners, type CategoryNotices } from '$lib/domain/categories';

	/**
	 * What needs attention, shown on the search page while nothing is typed:
	 * categories with unfilled required values and categories without
	 * parameters. Each notice opens the category card, where it is fixed.
	 */
	let { notices }: { notices: CategoryNotices } = $props();

	const list = $derived([
		...notices.incomplete.map((c) => ({
			id: c.id,
			title: `«${c.name}»: не заполнены параметры`,
			text: `Обязательных значений нет ${incompleteOwners(c.itemCount, c.typeCount)}.`
		})),
		...notices.empty.map((c) => ({
			id: c.id,
			title: `«${c.name}» без параметров`,
			text: 'Добавьте параметры, которые нужно заполнять у типов категории.'
		}))
	]);
</script>

{#if list.length}
	<ul class="mb-4 flex flex-col gap-2" aria-label="Уведомления">
		{#each list as notice (notice.id)}
			<li>
				<a
					href="/categories/{notice.id}"
					class="flex min-h-14 items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none dark:border-amber-800 dark:bg-gray-800 dark:text-amber-300 dark:hover:bg-gray-700"
				>
					<ExclamationCircleOutline class="h-5 w-5 shrink-0" />
					<span class="min-w-0 flex-1">
						<span class="block font-medium wrap-anywhere">{notice.title}</span>
						<span class="block text-sm text-amber-800 dark:text-amber-400">{notice.text}</span>
					</span>
					<ChevronRightOutline class="h-5 w-5 shrink-0" />
				</a>
			</li>
		{/each}
	</ul>
{/if}
