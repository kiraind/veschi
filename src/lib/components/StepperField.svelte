<script lang="ts">
	import { Button, Input, Label } from 'flowbite-svelte';
	import { MinusOutline, PlusOutline } from 'flowbite-svelte-icons';
	import type { Snippet } from 'svelte';

	/**
	 * A whole number from 1 to `max` with − and + around it. `error` replaces
	 * the own message about a wrong number; `hint` is shown under a valid one.
	 */
	let {
		label,
		value = $bindable(1),
		max = 1_000_000,
		disabled = false,
		error = '',
		hint
	}: {
		label: string;
		value?: number;
		max?: number;
		disabled?: boolean;
		error?: string;
		hint?: Snippet;
	} = $props();

	const id = $props.id();
	const whole = $derived(Number.isInteger(value));
	const valid = $derived(whole && value >= 1 && value <= max);
	const message = $derived(
		error || (valid ? '' : `Целое число от 1 до ${max.toLocaleString('ru')}`)
	);
</script>

<div>
	<Label for="stepper-{id}">{label}</Label>
	<div class="mt-1 flex items-center gap-2">
		<Button
			color="alternative"
			class="h-11 w-11 p-0"
			aria-label="Меньше"
			disabled={disabled || !whole || value <= 1}
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
				{max}
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
			disabled={disabled || !whole || value >= max}
			onclick={() => value++}
		>
			<PlusOutline class="h-5 w-5" />
		</Button>
	</div>
	{#if message}
		<p class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{message}</p>
	{:else if hint}
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{@render hint()}</p>
	{/if}
</div>
