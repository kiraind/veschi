<script lang="ts">
	import { api } from '$lib/api';
	import Thumb from './Thumb.svelte';
	import type { TypeSummary } from '$lib/server/services/types';

	/**
	 * Type field with autocomplete over existing types. Picking a suggestion
	 * sets `typeId`; free text leaves `typeId` null and `typeName` becomes the
	 * name of a new type (the server reuses a type with the same name).
	 */
	let {
		typeId = $bindable(null),
		typeName = $bindable(''),
		label = 'Тип'
	}: { typeId?: string | null; typeName?: string; label?: string } = $props();

	let suggestions = $state<TypeSummary[]>([]);
	let focused = $state(false);
	let request = 0;

	$effect(() => {
		const q = typeName.trim();
		if (!focused || !q || typeId) {
			suggestions = [];
			return;
		}
		const id = ++request;
		const timer = setTimeout(async () => {
			const found = await api.get<TypeSummary[]>(`/api/types?q=${encodeURIComponent(q)}`);
			if (id === request) suggestions = found;
		}, 200);
		return () => clearTimeout(timer);
	});

	function pick(type: TypeSummary) {
		typeId = type.id;
		typeName = type.name;
		suggestions = [];
	}
</script>

<div class="stack autocomplete">
	<label>
		{label}
		<input
			value={typeName}
			oninput={(e) => {
				typeName = e.currentTarget.value;
				typeId = null;
			}}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
			autocomplete="off"
			placeholder="Например, NE555 или Нож Victorinox"
			required
		/>
	</label>
	{#if suggestions.length > 0}
		<ul class="list suggestions" role="listbox">
			{#each suggestions as type (type.id)}
				<li>
					<button type="button" role="option" aria-selected="false" onclick={() => pick(type)}>
						<Thumb photoKey={type.photoKey} size={28} />
						<span>{type.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if typeId}
		<span class="muted">Существующий тип</span>
	{:else if typeName.trim()}
		<span class="muted">Будет создан новый тип «{typeName.trim()}», если такого ещё нет</span>
	{/if}
</div>

<style>
	.autocomplete {
		gap: 0.35rem;
	}
	.suggestions {
		gap: 0.25rem;
	}
	.suggestions button {
		width: 100%;
		justify-content: flex-start;
	}
</style>
