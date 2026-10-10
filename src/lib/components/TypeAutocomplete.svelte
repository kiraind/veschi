<script lang="ts">
	import { Input, Label } from 'flowbite-svelte';
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

<div class="flex flex-col gap-1.5">
	<Label>
		{label}
		<Input
			class="mt-1"
			value={typeName}
			oninput={(e) => {
				typeName = (e.currentTarget as HTMLInputElement).value;
				typeId = null;
			}}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
			autocomplete="off"
			placeholder="Например, NE555 или Нож Victorinox"
			required
		/>
	</Label>
	{#if suggestions.length > 0}
		<ul
			class="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
			role="listbox"
		>
			{#each suggestions as type (type.id)}
				<li>
					<button
						type="button"
						role="option"
						aria-selected="false"
						class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700"
						onclick={() => pick(type)}
					>
						<Thumb photoKey={type.photoKey} size={28} />
						<span class="min-w-0 break-words">{type.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if typeId}
		<span class="text-sm text-gray-500 dark:text-gray-400">Существующий тип</span>
	{:else if typeName.trim()}
		<span class="text-sm break-words text-gray-500 dark:text-gray-400"
			>Будет создан новый тип «{typeName.trim()}», если такого ещё нет</span
		>
	{/if}
</div>
