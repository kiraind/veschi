<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import Thumb from './Thumb.svelte';
	import PathTrail from './PathTrail.svelte';
	import type { SearchGroup } from '$lib/server/services/search';

	/**
	 * Search results grouped by type: the total quantity and, for every record,
	 * the container path where it lies (tap the quantity to open the record).
	 */
	let { groups }: { groups: SearchGroup[] } = $props();
</script>

<ul class="flex flex-col gap-3">
	{#each groups as group (group.typeId)}
		<li>
			<Card class="max-w-none gap-3 p-4">
				<div class="flex items-center gap-3">
					<Thumb photoKey={group.photoKey} size={56} container={group.isContainer} />
					<div class="min-w-0">
						<a href="/types/{group.typeId}" class="wrap-anywhere"
							><strong>{group.typeName}</strong></a
						>
						<div class="text-sm text-gray-500 dark:text-gray-400">всего {group.total} шт.</div>
					</div>
				</div>
				<ul class="divide-y divide-gray-200 dark:divide-gray-700">
					{#each group.locations as location (location.itemId)}
						<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 wrap-anywhere">
							<span class="min-w-0">
								<PathTrail path={location.path} emptyText="верхний уровень" />
								{#if location.name !== group.typeName}
									<span class="text-sm text-gray-500 dark:text-gray-400">· {location.name}</span>
								{/if}
							</span>
							<a
								class="inline-flex min-h-8 items-center rounded-full bg-primary-100 px-3 text-sm font-medium whitespace-nowrap text-primary-800 hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-300 dark:hover:bg-primary-800"
								href="/items/{location.itemId}"
								title="Открыть карточку"
							>
								{location.quantity} шт.
							</a>
						</li>
					{/each}
				</ul>
			</Card>
		</li>
	{/each}
</ul>
