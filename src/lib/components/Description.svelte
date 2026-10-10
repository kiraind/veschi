<script lang="ts">
	import { untrack } from 'svelte';
	import EditButton from './EditButton.svelte';

	/**
	 * A type description: the first three lines, the rest opens on a click. The pen
	 * (when `onedit` is given) sits inline at the end of the text; while the text is
	 * cut, it sits next to «Показать полностью».
	 */
	let {
		text,
		onedit,
		emptyText = 'Без описания'
	}: { text: string | null; onedit?: () => void; emptyText?: string } = $props();

	let expanded = $state(false);
	/** The text is longer than three lines (measured while it is cut). */
	let long = $state(false);
	let el: HTMLElement | undefined = $state();

	function measure() {
		if (el && !expanded) long = el.scrollHeight > el.clientHeight + 1;
	}

	// Re-measure when the text changes and when the width does. Only these reset `long`:
	// the pen leaves the cut text once it is long, which could otherwise make it fit again.
	$effect(() => {
		void text;
		void el;
		untrack(() => {
			expanded = false;
			long = false;
			measure();
		});
	});

	$effect(() => {
		if (!el) return;
		let width = el.clientWidth;
		const observer = new ResizeObserver(() => {
			if (!el || el.clientWidth === width) return;
			width = el.clientWidth;
			long = false;
			measure();
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	const cut = $derived(long && !expanded);
</script>

{#if text}
	<div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<p
			bind:this={el}
			class="whitespace-pre-line text-gray-700 dark:text-gray-300 {expanded
				? ''
				: 'line-clamp-3'} {cut ? 'cursor-pointer' : ''}"
			onclick={() => {
				if (cut) expanded = true;
			}}
		>
			{text}{#if onedit && !cut}<EditButton label="Изменить описание" onclick={onedit} />{/if}
		</p>
		{#if cut}
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="py-2 text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
					onclick={() => (expanded = true)}
				>
					Показать полностью
				</button>
				{#if onedit}<EditButton label="Изменить описание" onclick={onedit} />{/if}
			</div>
		{/if}
	</div>
{:else if onedit}
	<p class="text-sm text-gray-500 dark:text-gray-400">
		{emptyText}<EditButton label="Изменить описание" onclick={onedit} />
	</p>
{/if}
