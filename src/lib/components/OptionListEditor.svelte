<script lang="ts">
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

<ul class="list">
	{#each options as option, i (option.id ?? `new-${i}`)}
		<li class="row nowrap">
			<input bind:value={option.label} aria-label="Вариант {i + 1}" required />
			<button type="button" onclick={() => move(i, -1)} disabled={i === 0} title="Выше">↑</button>
			<button
				type="button"
				onclick={() => move(i, 1)}
				disabled={i === options.length - 1}
				title="Ниже">↓</button
			>
			<button
				type="button"
				class="danger"
				onclick={() => options.splice(i, 1)}
				disabled={(option.usage ?? 0) > 0}
				title={(option.usage ?? 0) > 0 ? `Используется: ${option.usage}` : 'Удалить'}>✕</button
			>
		</li>
	{/each}
</ul>
<div class="row nowrap">
	<input
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
	<button type="button" onclick={add}>Добавить</button>
</div>

<style>
	.nowrap {
		flex-wrap: nowrap;
		gap: 0.4rem;
	}
</style>
