<script lang="ts">
	import Thumb from './Thumb.svelte';
	import PathTrail from './PathTrail.svelte';
	import type { SearchGroup } from '$lib/server/services/search';

	/**
	 * Search results grouped by type: the total quantity and, for every record,
	 * the container path where it lies (tap the quantity to open the record).
	 */
	let { groups }: { groups: SearchGroup[] } = $props();
</script>

<ul class="list">
	{#each groups as group (group.typeId)}
		<li class="card stack">
			<div class="row head">
				<Thumb photoKey={group.photoKey} size={56} />
				<div>
					<a href="/types/{group.typeId}"><strong>{group.typeName}</strong></a>
					<div class="muted">всего {group.total} шт.</div>
				</div>
			</div>
			<ul class="list">
				{#each group.locations as location (location.itemId)}
					<li class="location">
						<PathTrail path={location.path} emptyText="верхний уровень" />
						{#if location.name !== group.typeName}
							<span class="muted">· {location.name}</span>
						{/if}
						<a class="badge" href="/items/{location.itemId}" title="Открыть карточку">
							{location.quantity} шт.
						</a>
					</li>
				{/each}
			</ul>
		</li>
	{/each}
</ul>

<style>
	.head {
		flex-wrap: nowrap;
	}
	.location {
		overflow-wrap: anywhere;
	}
	.badge {
		margin-left: 0.25rem;
		text-decoration: none;
	}
</style>
