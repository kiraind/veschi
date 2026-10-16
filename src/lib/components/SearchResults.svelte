<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { ChevronRightOutline } from 'flowbite-svelte-icons';
	import Thumb from './Thumb.svelte';
	import { formatPath } from '$lib/domain/item';
	import { pieces } from '$lib/domain/plural';
	import { formatCode } from '$lib/domain/sticker-code';
	import type { SearchGroup } from '$lib/server/services/search';

	/**
	 * Search results grouped by type: the type (a link to its page) with the total
	 * quantity and, for every record, a row opening that record: how many, its
	 * sticker ID and the container path where it lies.
	 */
	let { groups }: { groups: SearchGroup[] } = $props();
</script>

<ul class="flex flex-col gap-3">
	{#each groups as group (group.typeId)}
		<li>
			<Card class="max-w-none gap-2 p-4">
				<a href="/types/{group.typeId}" class="group flex items-center gap-3">
					<Thumb photoKey={group.photoKey} size={56} container={group.isContainer} />
					<div class="min-w-0">
						<strong
							class="wrap-anywhere text-primary-700 group-hover:underline dark:text-primary-500"
							>{group.typeName}</strong
						>
						<div class="text-sm text-gray-500 dark:text-gray-400">
							всего {pieces(group.total)}
						</div>
					</div>
				</a>
				<ul class="-mx-2 divide-y divide-gray-200 dark:divide-gray-700">
					{#each group.locations as location (location.itemId)}
						<li>
							<a
								href="/items/{location.itemId}"
								class="flex min-h-12 items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
							>
								<span class="min-w-0 flex-1">
									<span class="block wrap-anywhere text-gray-900 dark:text-white">
										<span class="font-medium">{pieces(location.quantity)}</span>
										{#if location.name !== group.typeName}
											<span class="text-gray-500 dark:text-gray-400">· {location.name}</span>
										{/if}
										{#if location.stickerCode}
											<span
												class="ms-1 font-mono text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
												>{formatCode(location.stickerCode)}</span
											>
										{/if}
									</span>
									<span class="block text-sm wrap-anywhere text-gray-500 dark:text-gray-400">
										{location.path.length ? formatPath(location.path) : 'верхний уровень'}
									</span>
								</span>
								<ChevronRightOutline class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
							</a>
						</li>
					{/each}
				</ul>
			</Card>
		</li>
	{/each}
</ul>
