<script lang="ts">
	import { ChevronRightOutline, ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { incompleteOwners, type CategoryNotices } from '$lib/domain/categories';

	/**
	 * What needs attention, shown on the search page while nothing is typed:
	 * categories with unfilled required values and categories without
	 * parameters. Each notice opens the category card, where it is fixed.
	 */
	const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	let { notices }: { notices: CategoryNotices } = $props();

	const list = $derived([
		...notices.incomplete.map((c) => ({
			id: c.id,
			title: `${capitalize(incompleteOwners(c.itemCount, c.typeCount))} в категории «${c.name}» не заполнены параметры`,
			text: 'Заполните недостающие данные.'
		})),
		...notices.empty.map((c) => ({
			id: c.id,
			title: `В категории «${c.name}» нет параметров`,
			text: 'Добавьте параметры или удалите категорию.'
		}))
	]);
</script>

{#if list.length}
	<ul class="mb-4 flex flex-col gap-2" aria-label="Уведомления">
		{#each list as notice (notice.id)}
			<li>
				<a
					href="/categories/{notice.id}"
					class="flex min-h-14 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-xs hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400/80"
					>
						<ExclamationCircleOutline class="h-5 w-5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium wrap-anywhere text-gray-900 dark:text-white"
							>{notice.title}</span
						>
						<span class="block text-sm text-gray-500 dark:text-gray-400">{notice.text}</span>
					</span>
					<ChevronRightOutline class="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
				</a>
			</li>
		{/each}
	</ul>
{/if}
