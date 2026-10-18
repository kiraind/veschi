<script lang="ts">
	import { Button, Label, Textarea } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import {
		CAPTION_MAX_LINES,
		STICKER_CAPTION_MAX_LENGTH,
		type StickerWidth,
		wrapCaption
	} from '$lib/domain/sticker-sheet';

	/**
	 * Edits what a sticker waiting for print will say, with a preview of the
	 * printed lines. The sticker stays ordered for the item; an empty caption
	 * goes back to the item's name.
	 */
	let {
		itemId,
		caption,
		name,
		width,
		onsaved
	}: {
		itemId: string;
		/** The caption now: edited, or the item's name. */
		caption: string;
		/** The item's name, what an empty caption turns into. */
		name: string;
		width: StickerWidth;
		onsaved: () => void | Promise<void>;
	} = $props();

	const id = $props.id();
	// The form is created anew each time it is shown, so it starts from the saved caption.
	// svelte-ignore state_referenced_locally
	let text = $state(caption);
	let busy = $state(false);
	let error = $state('');

	const shown = $derived(text.trim() || name);
	const preview = $derived(wrapCaption(shown, width));

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.patch(`/api/stickers/orders/${itemId}`, { caption: text.trim() });
			await onsaved();
		} catch (e) {
			error = errorText(e, 'Не удалось изменить подпись');
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-3" onsubmit={save}>
	<div>
		<Label for="caption-{id}">Подпись</Label>
		<Textarea
			id="caption-{id}"
			class="mt-1 w-full dark:border-gray-600 dark:bg-gray-700"
			bind:value={text}
			rows={2}
			maxlength={STICKER_CAPTION_MAX_LENGTH}
			placeholder={name}
		/>
		<div class="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
			<span class="text-gray-500 dark:text-gray-400">Пустая — название вещи</span>
			{#if text.trim() && text.trim() !== name}
				<button
					type="button"
					class="text-primary-700 hover:underline dark:text-primary-400"
					onclick={() => (text = name)}>Вернуть название вещи</button
				>
			{/if}
		</div>
	</div>
	<div>
		<p class="text-sm text-gray-500 dark:text-gray-400">На наклейке {width} мм:</p>
		<!-- Printed black on white, centred, as in the PDF. -->
		<div
			class="mt-1 inline-block max-w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-center text-sm leading-snug text-black dark:border-gray-600"
			aria-label="Как будет напечатано"
		>
			{#each preview.lines as line, i (i)}<span class="block break-words">{line}</span>{/each}
		</div>
		{#if preview.truncated}
			<p class="mt-1 text-sm text-amber-700 dark:text-amber-400">
				Не влезает в {CAPTION_MAX_LINES} строки, конец обрезан.
			</p>
		{/if}
	</div>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<Button type="submit" class="self-start" disabled={busy} loading={busy}>Сохранить</Button>
</form>
