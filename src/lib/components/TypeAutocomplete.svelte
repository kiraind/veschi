<script lang="ts">
	import RequiredMark from './RequiredMark.svelte';
	import { tick } from 'svelte';
	import { Badge, Input, Label } from 'flowbite-svelte';
	import { CloseOutline } from 'flowbite-svelte-icons';
	import { api } from '$lib/api';
	import Thumb from './Thumb.svelte';
	import type { TypeInfo, TypeSummary } from '$lib/server/services/types';

	/**
	 * Type field with autocomplete over existing types. Picking a suggestion
	 * replaces the field with the type's card (photo, name; the cross brings
	 * the field back) and sets `typeId` / `selected`; free text leaves them
	 * null and `typeName` becomes the name of a new type (the server reuses a
	 * type with the same name; leaving the field with such a name picks it).
	 */
	let {
		typeId = $bindable(null),
		typeName = $bindable(''),
		selected = $bindable(null),
		label = 'Тип',
		allowNew = true
	}: {
		typeId?: string | null;
		typeName?: string;
		/** The picked existing type. */
		selected?: TypeInfo | null;
		label?: string;
		/** Free text names a new type; without it only an existing type can be picked. */
		allowNew?: boolean;
	} = $props();

	const uid = $props.id();
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
			// Without suggestions the typed name still works (a new type or the one with that name).
			const found = await api
				.get<TypeSummary[]>(`/api/types?q=${encodeURIComponent(q)}`)
				.catch(() => []);
			if (id === request) suggestions = found;
		}, 200);
		return () => clearTimeout(timer);
	});

	function pick(type: TypeSummary) {
		typeId = type.id;
		typeName = type.name;
		selected = type;
		suggestions = [];
	}

	/**
	 * Leaving the field with the exact name of an existing type picks that type,
	 * so its own mark «контейнер» and photo apply instead of a new type's.
	 */
	function leave() {
		const name = typeName.trim().toLocaleLowerCase('ru');
		const exact = suggestions.find((t) => t.name.toLocaleLowerCase('ru') === name);
		if (exact && !typeId) pick(exact);
		focused = false;
	}

	async function reset() {
		typeId = null;
		typeName = '';
		selected = null;
		await tick();
		document.getElementById(`${uid}-input`)?.focus();
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if typeId && selected}
		<span class="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
		<div
			class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
		>
			<Thumb photoKey={selected.photoKey} size={56} container={selected.isContainer} />
			<div class="min-w-0 flex-1">
				<strong class="wrap-anywhere">{selected.name}</strong>
				{#if selected.isContainer}<Badge color="indigo" class="ms-1">контейнер</Badge>{/if}
				{#if selected.description}
					<p class="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
						{selected.description}
					</p>
				{/if}
			</div>
			<button
				type="button"
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
				onclick={reset}
				title="Выбрать другой тип"
				aria-label="Выбрать другой тип"><CloseOutline class="h-5 w-5" /></button
			>
		</div>
	{:else}
		<Label>
			{label}<RequiredMark />
			<Input
				id="{uid}-input"
				class="mt-1"
				value={typeName}
				oninput={(e) => {
					typeName = (e.currentTarget as HTMLInputElement).value;
					typeId = null;
					selected = null;
				}}
				onfocus={() => (focused = true)}
				onblur={() => setTimeout(leave, 150)}
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
							<Thumb photoKey={type.photoKey} size={28} container={type.isContainer} />
							<span class="min-w-0 break-words">{type.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if typeName.trim() && allowNew}
			<span class="text-sm break-words text-gray-500 dark:text-gray-400"
				>Будет создан новый тип «{typeName.trim()}», если такого ещё нет</span
			>
		{:else if typeName.trim()}
			<span class="text-sm text-gray-500 dark:text-gray-400">Выберите тип из списка</span>
		{/if}
	{/if}
</div>
