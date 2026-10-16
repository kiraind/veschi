<script lang="ts" module>
	export type Contents = 'parent' | 'workbench' | 'discard';
</script>

<script lang="ts">
	import { Radio, Select } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';

	/** «Что сделать с содержимым?» when a container is thrown away. */
	let {
		contents = $bindable('parent'),
		workbenchId = $bindable(null),
		parentLabel = 'Переложить туда, где лежал контейнер'
	}: {
		contents?: Contents;
		workbenchId?: string | null;
		/** The first option, naming the place when it is known («Переложить в «Шкаф»»). */
		parentLabel?: string;
	} = $props();

	let benches = $state<{ id: string; name: string }[] | null>(null);
	let error = $state('');

	const radioLabel = 'min-h-10 cursor-pointer text-base font-normal text-gray-900 dark:text-white';

	async function loadBenches() {
		if (benches) return;
		try {
			const data = await api.get<{
				workbenches: { id: string; name: string }[];
				lastWorkbenchId: string | null;
			}>('/api/workbenches');
			benches = data.workbenches;
			workbenchId =
				benches.find((b) => b.id === data.lastWorkbenchId)?.id ?? benches[0]?.id ?? null;
		} catch (e) {
			error = errorText(e);
		}
	}
</script>

<fieldset class="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
	<legend class="px-1 text-sm font-medium text-gray-700 dark:text-gray-200">
		Что сделать с содержимым?
	</legend>
	<Radio value="parent" bind:group={contents} classes={{ label: radioLabel }}>
		{parentLabel}
	</Radio>
	<Radio
		value="workbench"
		bind:group={contents}
		onchange={loadBenches}
		classes={{ label: radioLabel }}
	>
		Переложить на рабочий стол
	</Radio>
	{#if contents === 'workbench'}
		{#if benches && benches.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Столов пока нет — <a href="/workbench/settings">создать рабочий стол</a>.
			</p>
		{:else if benches}
			<Select bind:value={workbenchId} placeholder="" aria-label="Рабочий стол">
				{#each benches as bench (bench.id)}
					<option value={bench.id}>{bench.name}</option>
				{/each}
			</Select>
		{/if}
	{/if}
	<Radio value="discard" bind:group={contents} classes={{ label: radioLabel }}>
		Выкинуть вместе с контейнером
	</Radio>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</fieldset>
