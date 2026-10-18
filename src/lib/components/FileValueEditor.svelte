<script lang="ts">
	import { Button, Label } from 'flowbite-svelte';
	import { FileOutline, PenOutline, RefreshOutline } from 'flowbite-svelte-icons';
	import { fileExtension, formatFileSize } from '$lib/domain/params';
	import Sheet from './Sheet.svelte';

	/**
	 * An uploaded file of a FILE value as a card: its type, name and size, a
	 * pen to rename it and a button to replace it. The pen opens a sheet with
	 * the name without the extension, which stays the file's.
	 */
	let {
		file = $bindable(),
		onreplace
	}: {
		file: { fileName: string; fileSize: number };
		onreplace: () => void;
	} = $props();

	const id = $props.id();
	const ext = $derived(fileExtension(file.fileName));
	const kind = $derived(ext.slice(1, 5).toUpperCase());

	let renaming = $state(false);
	let name = $state('');

	function startRenaming() {
		name = ext ? file.fileName.slice(0, -ext.length) : file.fileName;
		renaming = true;
	}

	function rename() {
		if (!name.trim()) return;
		file.fileName = name.trim() + ext;
		renaming = false;
	}

	const iconButton =
		'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white';
</script>

<div
	class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
>
	<div
		class="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300"
	>
		<FileOutline class="h-5 w-5" />
		{#if kind}<span class="text-[10px] leading-none font-semibold">{kind}</span>{/if}
	</div>
	<div class="min-w-0 flex-1">
		<p class="font-medium [overflow-wrap:anywhere] text-gray-900 dark:text-white">
			{file.fileName}
		</p>
		<p class="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(file.fileSize)}</p>
	</div>
	<button
		type="button"
		class={iconButton}
		title="Переименовать"
		aria-label="Переименовать файл"
		onclick={startRenaming}><PenOutline class="h-5 w-5" /></button
	>
	<button
		type="button"
		class="{iconButton} -ms-2"
		title="Заменить"
		aria-label="Заменить файл"
		onclick={onreplace}><RefreshOutline class="h-5 w-5" /></button
	>
</div>

<Sheet bind:open={renaming} title="Имя файла">
	<!-- Not a form: the sheet may sit inside one («Новая вещь»), and a nested submit would reach it. -->
	<div class="flex flex-col gap-3">
		<div>
			<Label for="file-name-{id}">Название</Label>
			<div class="mt-1 flex">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="file-name-{id}"
					class="block w-full min-w-0 border border-gray-300 bg-gray-50 p-2.5 text-gray-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500 dark:focus:ring-primary-500 {ext
						? 'rounded-s-lg'
						: 'rounded-lg'}"
					bind:value={name}
					autofocus
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							rename();
						}
					}}
				/>
				{#if ext}
					<span
						class="inline-flex shrink-0 items-center rounded-e-lg border border-s-0 border-gray-300 bg-gray-200 px-3 text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300"
						>{ext}</span
					>
				{/if}
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button type="button" onclick={rename} disabled={!name.trim()}>Готово</Button>
			<Button type="button" color="alternative" onclick={() => (renaming = false)}>Отмена</Button>
		</div>
	</div>
</Sheet>
