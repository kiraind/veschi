<script lang="ts">
	import { Button, ButtonGroup } from 'flowbite-svelte';
	import { STICKER_WIDTHS, type StickerWidth } from '$lib/domain/sticker-sheet';

	/** «20 мм | 40 мм» segmented choice of the sticker width. */
	let {
		value,
		onpick,
		disabled = false,
		label = 'Ширина наклейки'
	}: {
		/** The chosen width, or null when nothing is chosen yet. */
		value: StickerWidth | null;
		onpick: (width: StickerWidth) => void;
		disabled?: boolean;
		label?: string;
	} = $props();
</script>

<ButtonGroup class="shrink-0" role="radiogroup" aria-label={label}>
	{#each STICKER_WIDTHS as width (width)}
		{@const selected = value === width}
		<Button
			size="sm"
			class="h-10 px-3 whitespace-nowrap"
			color={selected ? 'primary' : 'alternative'}
			type="button"
			role="radio"
			aria-checked={selected}
			{disabled}
			onclick={() => onpick(width)}
		>
			{width} мм
		</Button>
	{/each}
</ButtonGroup>
