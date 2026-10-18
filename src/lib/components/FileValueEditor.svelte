<script lang="ts">
	import { FileOutline, PenOutline, RefreshOutline } from 'flowbite-svelte-icons';
	import { fileExtension, formatFileSize } from '$lib/domain/params';

	/**
	 * An uploaded file of a FILE value as a card: its type, name and size, a
	 * pen to rename it and a button to replace it. Renaming edits the name
	 * without the extension, which stays the file's.
	 */
	let {
		file = $bindable(),
		onreplace
	}: {
		file: { fileName: string; fileSize: number };
		onreplace: () => void;
	} = $props();

	const ext = $derived(fileExtension(file.fileName));
	const base = $derived(ext ? file.fileName.slice(0, -ext.length) : file.fileName);
	const kind = $derived(ext.slice(1, 5).toUpperCase());

	let renaming = $state(false);
	/** The name before renaming, back when nothing is left of it. */
	let before = '';

	function startRenaming() {
		before = file.fileName;
		renaming = true;
	}

	function rename(value: string) {
		file.fileName = value + ext;
	}

	function finish() {
		if (!base.trim()) file.fileName = before;
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
		{#if renaming}
			<div class="flex">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="block w-full min-w-0 border border-gray-300 bg-white p-2 text-gray-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500 dark:focus:ring-primary-500 {ext
						? 'rounded-s-lg'
						: 'rounded-lg'}"
					value={base}
					oninput={(e) => rename(e.currentTarget.value)}
					aria-label="Имя файла"
					autofocus
					onblur={finish}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							finish();
						}
					}}
				/>
				{#if ext}
					<span
						class="inline-flex shrink-0 items-center rounded-e-lg border border-s-0 border-gray-300 bg-gray-200 px-2.5 text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300"
						>{ext}</span
					>
				{/if}
			</div>
		{:else}
			<p class="font-medium [overflow-wrap:anywhere] text-gray-900 dark:text-white">
				{file.fileName}
			</p>
			<p class="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(file.fileSize)}</p>
		{/if}
	</div>
	{#if !renaming}
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
	{/if}
</div>
