<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import { ArrowDownOutline, ArrowUpOutline, CloseOutline } from 'flowbite-svelte-icons';

	/** Ordered option list of a dictionary: rename, reorder, add, remove. */
	let { options = $bindable() }: { options: { id?: string; label: string; usage?: number }[] } =
		$props();

	let fresh = $state('');

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= options.length) return;
		[options[index], options[target]] = [options[target]!, options[index]!];
	}

	function add() {
		const label = fresh.trim();
		if (!label) return;
		options.push({ label });
		fresh = '';
	}
</script>

<ul class="flex flex-col gap-2">
	{#each options as option, i (option.id ?? `new-${i}`)}
		<li class="flex items-center gap-1.5">
			<div class="min-w-0 flex-1">
				<Input bind:value={option.label} aria-label="Вариант {i + 1}" required />
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
<div class="flex items-center gap-1.5">
	<div class="min-w-0 flex-1">
		<Input
			bind:value={fresh}
			placeholder="Новый вариант"
			aria-label="Новый вариант"
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					add();
				}
			}}
		/>
	</div>
	<Button color="alternative" class="shrink-0" type="button" onclick={add}>Добавить</Button>
</div>
