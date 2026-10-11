<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Helper } from 'flowbite-svelte';
	import { CloseOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import type { CategoryRef, RequiredParam } from '$lib/domain/categories';
	import { confirmAction } from '$lib/confirm.svelte';
	import CategoryPicker from './CategoryPicker.svelte';

	/**
	 * Categories of a type on its card: a chip per category (link, cross to
	 * take the type out) and «Категория» to put it into one more.
	 */
	let {
		typeId,
		categories,
		itemRequired
	}: { typeId: string; categories: CategoryRef[]; itemRequired: RequiredParam[] } = $props();

	let picking = $state(false);
	let error = $state('');

	async function run(action: () => Promise<unknown>) {
		error = '';
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		}
	}

	async function add(category: CategoryRef) {
		await api.post(`/api/types/${typeId}/categories`, { categoryId: category.id });
		picking = false;
		await invalidateAll();
	}

	async function remove(category: CategoryRef) {
		const ok = await confirmAction({
			title: `Убрать тип из категории «${category.name}»?`,
			message: 'Её параметры перестанут быть обязательными. Заполненные значения останутся.',
			confirmLabel: 'Убрать'
		});
		if (ok) run(() => api.delete(`/api/types/${typeId}/categories/${category.id}`));
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#each categories as category (category.id)}
		<span
			class="inline-flex h-10 items-center rounded-lg bg-primary-100 ps-3 text-sm font-medium text-primary-800 dark:bg-primary-900/60 dark:text-primary-200"
		>
			<a href="/categories/{category.id}" class="hover:underline">{category.name}</a>
			<button
				type="button"
				class="flex h-10 w-9 items-center justify-center rounded-e-lg hover:bg-primary-200 dark:hover:bg-primary-800"
				title="Убрать из категории"
				aria-label="Убрать из категории «{category.name}»"
				onclick={() => remove(category)}><CloseOutline class="h-4 w-4" /></button
			>
		</span>
	{/each}
	{#if !picking}
		<Button color="alternative" size="sm" class="h-10" onclick={() => (picking = true)}>
			<PlusOutline class="me-1 h-4 w-4" />Категория
		</Button>
	{/if}
</div>
{#if picking}
	<div class="mt-2">
		<CategoryPicker
			onpick={add}
			oncancel={() => (picking = false)}
			exclude={categories.map((c) => c.id)}
		/>
	</div>
{/if}
{#if itemRequired.length}
	<Helper class="mt-2">
		У каждой вещи этого типа нужно заполнить: {itemRequired.map((r) => r.def.name).join(', ')}.
	</Helper>
{:else if categories.length === 0 && !picking}
	<Helper class="mt-2">
		Категория задаёт, какие параметры обязательно заполнить: например, у «Еды» — калорийность и срок
		годности.
	</Helper>
{/if}
{#if error}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
