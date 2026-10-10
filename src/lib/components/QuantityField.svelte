<script lang="ts">
	import { Input, Label } from 'flowbite-svelte';
	import { quantityError } from '$lib/domain/workbench';

	/**
	 * «Сколько (из N)»: how much of an item an action takes. The parent shows it
	 * only when there is more than one, starts `value` at `available` (all) and
	 * blocks the action while `quantityError(available, value)` is set.
	 */
	let {
		available,
		value = $bindable(),
		label = 'Сколько'
	}: { available: number; value: number; label?: string } = $props();

	const id = $props.id();
	const problem = $derived(quantityError(available, value));
</script>

<div>
	<Label for="qty-{id}">{label} (из {available})</Label>
	<div class="mt-1 flex flex-wrap items-center gap-2">
		<Input
			id="qty-{id}"
			class="max-w-32"
			type="number"
			min="1"
			max={available}
			step="1"
			inputmode="numeric"
			bind:value
		/>
		{#if value !== available}
			<button
				type="button"
				class="min-h-10 px-2 text-sm text-primary-700 hover:underline dark:text-primary-500"
				onclick={() => (value = available)}>все</button
			>
		{/if}
	</div>
	{#if problem}<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
			{problem}
		</p>{/if}
</div>
