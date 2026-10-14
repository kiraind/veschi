<script lang="ts">
	import { Select } from 'flowbite-svelte';
	import { STICKER_WIDTHS, type StickerWidth } from '$lib/domain/sticker-sheet';

	/** Drop-down choice of the sticker width: 10, 20 or 40 mm. */
	let {
		value,
		onpick,
		disabled = false,
		label = 'Ширина наклейки',
		class: className = ''
	}: {
		value: StickerWidth;
		onpick: (width: StickerWidth) => void;
		disabled?: boolean;
		label?: string;
		class?: string;
	} = $props();
</script>

<Select
	class="w-28 shrink-0 {className}"
	placeholder=""
	aria-label={label}
	title={label}
	{disabled}
	value={String(value)}
	onchange={(e) => onpick(Number(e.currentTarget.value) as StickerWidth)}
>
	{#each STICKER_WIDTHS as width (width)}
		<option value={String(width)}>{width} мм</option>
	{/each}
</Select>
