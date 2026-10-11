<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Input } from 'flowbite-svelte';
	import {
		ArrowDownOutline,
		ArrowUpOutline,
		CloseOutline,
		PlusOutline
	} from 'flowbite-svelte-icons';

	/**
	 * Ordered option list of a dictionary: rename, reorder, add, remove. «Вариант» adds
	 * an empty option and puts the cursor in it; Enter in the last one adds the next.
	 */
	let { options = $bindable() }: { options: { id?: string; label: string; usage?: number }[] } =
		$props();

	let list: HTMLUListElement | undefined = $state();

	function inputs(): HTMLInputElement[] {
		return [...(list?.querySelectorAll('input') ?? [])];
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= options.length) return;
		[options[index], options[target]] = [options[target]!, options[index]!];
	}

	async function add() {
		options.push({ label: '' });
		await tick();
		inputs().at(-1)?.focus();
	}

	/**
	 * Enter goes to the next option (adding one after the last) instead of
	 * submitting; Enter in an empty last option submits the form as usual.
	 */
	function onkeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'Enter') return;
		if (index === options.length - 1 && !options[index]?.label.trim()) return;
		event.preventDefault();
		if (index === options.length - 1) add();
		else inputs()[index + 1]?.focus();
	}
</script>

<ul class="flex flex-col gap-2" bind:this={list}>
	{#each options as option, i (option.id ?? `new-${i}`)}
		<li class="flex items-center gap-1.5">
			<div class="min-w-0 flex-1">
				<Input
					bind:value={option.label}
					aria-label="Вариант {i + 1}"
					required
					onkeydown={(e) => onkeydown(e, i)}
				/>
			</div>
			<Button
				color="alternative"
				class="h-10 w-10 shrink-0 p-0"
				type="button"
				onclick={() => move(i, -1)}
				disabled={i === 0}
				title="Выше"
				aria-label="Выше"><ArrowUpOutline class="h-4 w-4" /></Button
			>
			<Button
				color="alternative"
				class="h-10 w-10 shrink-0 p-0"
				type="button"
				onclick={() => move(i, 1)}
				disabled={i === options.length - 1}
				title="Ниже"
				aria-label="Ниже"><ArrowDownOutline class="h-4 w-4" /></Button
			>
			<Button
				color="red"
				outline
				class="h-10 w-10 shrink-0 p-0"
				type="button"
				onclick={() => options.splice(i, 1)}
				disabled={(option.usage ?? 0) > 0}
				title={(option.usage ?? 0) > 0 ? `Используется: ${option.usage}` : 'Удалить'}
				aria-label="Удалить"><CloseOutline class="h-4 w-4" /></Button
			>
		</li>
	{/each}
</ul>
<div>
	<Button color="alternative" type="button" onclick={add}>
		<PlusOutline class="me-1 h-4 w-4" />Вариант
	</Button>
</div>
