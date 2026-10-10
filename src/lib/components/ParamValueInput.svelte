<script lang="ts">
	import { Button, Fileupload, Input, Radio, Select } from 'flowbite-svelte';
	import { api, ApiError } from '$lib/api';
	import type { ParamDraft } from '$lib/domain/param-draft';
	import { formatFileSize } from '$lib/domain/params';
	import type { FileValue } from '$lib/server/services/files';
	import type { DictionaryView } from '$lib/server/services/dictionaries';
	import RefPicker from './RefPicker.svelte';

	/** Value fields of one parameter, depending on its value type. */
	let {
		draft = $bindable(),
		dictionaries
	}: { draft: ParamDraft; dictionaries: DictionaryView[] | null } = $props();

	const dictionary = $derived(dictionaries?.find((d) => d.id === draft.dictionaryId));
	let uploading = $state(false);
	let uploadError = $state('');

	function toggleOption(id: string, checked: boolean) {
		if (!dictionary?.multiple) draft.optionIds = checked ? [id] : [];
		else
			draft.optionIds = checked
				? [...draft.optionIds, id]
				: draft.optionIds.filter((o) => o !== id);
	}

	async function upload(input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		uploadError = '';
		try {
			const body = new FormData();
			body.set('file', file);
			const { valueType: _type, ...value } = await api.post<FileValue>('/api/uploads', body);
			draft.file = value;
		} catch (e) {
			uploadError = e instanceof ApiError ? e.message : String(e);
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

{#if draft.valueType === 'STRING'}
	<Input bind:value={draft.text} placeholder="Значение" aria-label="Значение" />
{:else if draft.valueType === 'NUMBER'}
	<div class="flex items-center gap-1.5">
		<div class="min-w-0 flex-1">
			<Input bind:value={draft.number} inputmode="decimal" placeholder="85" aria-label="Число" />
		</div>
		<div class="w-20 shrink-0">
			<Input bind:value={draft.unit} placeholder="мм" aria-label="Единица" />
		</div>
	</div>
{:else if draft.valueType === 'RANGE'}
	<div class="flex items-center gap-1.5">
		<div class="min-w-0 flex-1">
			<Input bind:value={draft.min} inputmode="decimal" placeholder="от" aria-label="Минимум" />
		</div>
		<span>–</span>
		<div class="min-w-0 flex-1">
			<Input bind:value={draft.max} inputmode="decimal" placeholder="до" aria-label="Максимум" />
		</div>
		<div class="w-16 shrink-0">
			<Input bind:value={draft.unit} placeholder="В" aria-label="Единица" />
		</div>
	</div>
{:else if draft.valueType === 'ENUM'}
	{#if dictionaries === null}
		<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка справочников…</p>
	{:else if dictionaries.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Справочников нет. <a
				class="text-primary-700 hover:underline dark:text-primary-400"
				href="/dictionaries">Создать справочник</a
			>
		</p>
	{:else}
		<Select
			value={draft.dictionaryId}
			onchange={(e) => {
				draft.dictionaryId = e.currentTarget.value;
				draft.optionIds = [];
			}}
			aria-label="Справочник"
			placeholder=""
		>
			<option value="" disabled>Справочник…</option>
			{#each dictionaries as d (d.id)}
				<option value={d.id}>{d.name}</option>
			{/each}
		</Select>
		{#if dictionary}
			<div class="flex flex-wrap gap-x-4 gap-y-1">
				{#each dictionary.options as option (option.id)}
					<label class="flex min-h-10 items-center gap-2 text-sm text-gray-900 dark:text-white">
						<input
							class="h-4 w-4 border-gray-300 bg-gray-100 text-primary-600 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800 dark:focus:ring-primary-600 {dictionary.multiple
								? 'rounded-sm'
								: ''}"
							type={dictionary.multiple ? 'checkbox' : 'radio'}
							name="enum-{draft.uid}"
							checked={draft.optionIds.includes(option.id)}
							onchange={(e) => toggleOption(option.id, e.currentTarget.checked)}
						/>
						{option.label}
					</label>
				{/each}
			</div>
		{/if}
	{/if}
{:else if draft.valueType === 'URL'}
	<Input type="url" bind:value={draft.url} placeholder="https://…" aria-label="Ссылка" />
{:else if draft.valueType === 'FILE'}
	{#if draft.file}
		<div class="flex flex-wrap items-center gap-2">
			<span class="min-w-0 break-words">{draft.file.fileName}</span>
			<span class="text-sm text-gray-500 dark:text-gray-400"
				>{formatFileSize(draft.file.fileSize)}</span
			>
			<Button color="alternative" size="sm" type="button" onclick={() => (draft.file = null)}
				>Заменить</Button
			>
		</div>
	{:else}
		<Fileupload disabled={uploading} onchange={(e) => upload(e.currentTarget)} aria-label="Файл" />
		{#if uploading}<span class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</span>{/if}
		{#if uploadError}<span class="text-sm text-red-600 dark:text-red-500">{uploadError}</span>{/if}
	{/if}
{:else if draft.valueType === 'DATE'}
	<Input type="date" bind:value={draft.date} aria-label="Дата" />
{:else if draft.valueType === 'REF'}
	<RefPicker bind:value={draft.ref} />
{:else if draft.valueType === 'BOOLEAN'}
	<div class="flex flex-wrap gap-x-4">
		<Radio classes={{ label: 'min-h-10' }} bind:group={draft.bool} value={true}>да</Radio>
		<Radio classes={{ label: 'min-h-10' }} bind:group={draft.bool} value={false}>нет</Radio>
	</div>
{/if}
