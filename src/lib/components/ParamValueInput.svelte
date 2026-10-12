<script lang="ts">
	import { Button, Fileupload, Input, Radio, Select } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import type { ParamDraft } from '$lib/domain/param-draft';
	import { formatFileSize, type ParamDefView } from '$lib/domain/params';
	import { shortenFileName } from '$lib/domain/shorten';
	import type { FileValue } from '$lib/server/services/files';
	import DateInput from './DateInput.svelte';
	import LinkPicker from './LinkPicker.svelte';

	/**
	 * Value fields of one parameter, depending on its value type. The unit is
	 * the definition's (shown, not edited); ENUM options come from the
	 * definition (`def`, null while loading).
	 */
	let { draft = $bindable(), def }: { draft: ParamDraft; def: ParamDefView | null } = $props();

	let uploading = $state(false);
	let uploadError = $state('');

	function toggleOption(id: string, checked: boolean) {
		if (!def?.multiple) draft.optionIds = checked ? [id] : [];
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
			uploadError = errorText(e);
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
		{#if draft.unit}<span class="shrink-0 text-gray-500 dark:text-gray-400">{draft.unit}</span>{/if}
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
		{#if draft.unit}<span class="shrink-0 text-gray-500 dark:text-gray-400">{draft.unit}</span>{/if}
	</div>
{:else if draft.valueType === 'ENUM'}
	{#if !def}
		<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка вариантов…</p>
	{:else if def.options.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			У параметра «{def.name}» нет вариантов.
			<a class="text-primary-700 hover:underline dark:text-primary-400" href="/params/{def.id}"
				>Добавить варианты</a
			>
		</p>
	{:else if def.multiple}
		<div class="flex flex-wrap gap-x-4 gap-y-1">
			{#each def.options as option (option.id)}
				<label class="flex min-h-10 items-center gap-2 text-sm text-gray-900 dark:text-white">
					<input
						class="h-4 w-4 rounded-sm border-gray-300 bg-gray-100 text-primary-600 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800 dark:focus:ring-primary-600"
						type="checkbox"
						checked={draft.optionIds.includes(option.id)}
						onchange={(e) => toggleOption(option.id, e.currentTarget.checked)}
					/>
					{option.label}
				</label>
			{/each}
		</div>
	{:else}
		<Select
			value={draft.optionIds[0] ?? ''}
			onchange={(e) => (draft.optionIds = e.currentTarget.value ? [e.currentTarget.value] : [])}
			aria-label={draft.key}
			placeholder=""
		>
			<option value="" disabled>Выберите…</option>
			{#each def.options as option (option.id)}
				<option value={option.id}>{option.label}</option>
			{/each}
		</Select>
	{/if}
{:else if draft.valueType === 'URL'}
	<Input type="url" bind:value={draft.url} placeholder="https://…" aria-label="Ссылка" />
{:else if draft.valueType === 'FILE'}
	{#if draft.file}
		<div class="flex flex-wrap items-center gap-2">
			<span class="min-w-0 break-words" title={draft.file.fileName}
				>{shortenFileName(draft.file.fileName)}</span
			>
			<span class="text-sm text-gray-500 dark:text-gray-400"
				>{formatFileSize(draft.file.fileSize)}</span
			>
			<Button
				color="alternative"
				size="sm"
				class="h-10"
				type="button"
				onclick={() => (draft.file = null)}>Заменить</Button
			>
		</div>
	{:else}
		<Fileupload disabled={uploading} onchange={(e) => upload(e.currentTarget)} aria-label="Файл" />
		{#if uploading}<span class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</span>{/if}
		{#if uploadError}<span class="text-sm text-red-600 dark:text-red-500">{uploadError}</span>{/if}
	{/if}
{:else if draft.valueType === 'DATE'}
	<DateInput bind:value={draft.date} aria-label={draft.key} />
{:else if draft.valueType === 'ITEM' || draft.valueType === 'TYPE'}
	<LinkPicker bind:value={draft.refs} kind={draft.valueType} />
{:else if draft.valueType === 'BOOLEAN'}
	<div class="flex flex-wrap gap-x-4">
		<Radio classes={{ label: 'min-h-10' }} bind:group={draft.bool} value={true}>да</Radio>
		<Radio classes={{ label: 'min-h-10' }} bind:group={draft.bool} value={false}>нет</Radio>
	</div>
{/if}
