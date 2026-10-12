<script lang="ts">
	import { Button, Input, Label } from 'flowbite-svelte';
	import { MinusOutline, PlusOutline } from 'flowbite-svelte-icons';

	/** A whole number from 1 with − and + around it (how many a collection needs). */
	let {
		label,
		value = $bindable(1),
		disabled = false
	}: { label: string; value?: number; disabled?: boolean } = $props();

	const id = $props.id();
	const valid = $derived(Number.isInteger(value) && value >= 1 && value <= 1_000_000);
</script>

<div>
	<Label for="stepper-{id}">{label}</Label>
	<div class="mt-1 flex items-center gap-2">
		<Button
			color="alternative"
			class="h-11 w-11 p-0"
			aria-label="Меньше"
			disabled={disabled || !valid || value <= 1}
			onclick={() => value--}
		>
			<MinusOutline class="h-5 w-5" />
		</Button>
		<div class="w-24">
			<Input
				id="stepper-{id}"
				class="text-center text-lg"
				type="number"
				min="1"
				max="1000000"
				step="1"
				inputmode="numeric"
				{disabled}
				bind:value
			/>
		</div>
		<Button
			color="alternative"
			class="h-11 w-11 p-0"
			aria-label="Больше"
			disabled={disabled || !valid || value >= 1_000_000}
			onclick={() => value++}
		>
			<PlusOutline class="h-5 w-5" />
		</Button>
	</div>
	{#if !valid}
		<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">
			Целое число от 1 до 1 000 000
		</p>
	{/if}
</div>
