<script lang="ts">
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
	<input bind:value={draft.text} placeholder="Значение" aria-label="Значение" />
{:else if draft.valueType === 'NUMBER'}
	<div class="row nowrap">
		<input bind:value={draft.number} inputmode="decimal" placeholder="85" aria-label="Число" />
		<input class="unit" bind:value={draft.unit} placeholder="мм" aria-label="Единица" />
	</div>
{:else if draft.valueType === 'RANGE'}
	<div class="row nowrap">
		<input bind:value={draft.min} inputmode="decimal" placeholder="от" aria-label="Минимум" />
		<span>–</span>
		<input bind:value={draft.max} inputmode="decimal" placeholder="до" aria-label="Максимум" />
		<input class="unit" bind:value={draft.unit} placeholder="В" aria-label="Единица" />
	</div>
{:else if draft.valueType === 'ENUM'}
	{#if dictionaries === null}
		<p class="muted">Загрузка справочников…</p>
	{:else if dictionaries.length === 0}
		<p class="muted">Справочников нет. <a href="/dictionaries">Создать справочник</a></p>
	{:else}
		<select
			value={draft.dictionaryId}
			onchange={(e) => {
				draft.dictionaryId = e.currentTarget.value;
				draft.optionIds = [];
			}}
			aria-label="Справочник"
		>
			<option value="" disabled>Справочник…</option>
			{#each dictionaries as d (d.id)}
				<option value={d.id}>{d.name}</option>
			{/each}
		</select>
		{#if dictionary}
			<div class="row options">
				{#each dictionary.options as option (option.id)}
					<label class="option">
						<input
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
	<input type="url" bind:value={draft.url} placeholder="https://…" aria-label="Ссылка" />
{:else if draft.valueType === 'FILE'}
	{#if draft.file}
		<div class="row">
			<span>{draft.file.fileName}</span>
			<span class="muted">{formatFileSize(draft.file.fileSize)}</span>
			<button type="button" onclick={() => (draft.file = null)}>Заменить</button>
		</div>
	{:else}
		<input
			type="file"
			disabled={uploading}
			onchange={(e) => upload(e.currentTarget)}
			aria-label="Файл"
		/>
		{#if uploading}<span class="muted">Загрузка…</span>{/if}
		{#if uploadError}<span class="error">{uploadError}</span>{/if}
	{/if}
{:else if draft.valueType === 'DATE'}
	<input type="date" bind:value={draft.date} aria-label="Дата" />
{:else if draft.valueType === 'REF'}
	<RefPicker bind:value={draft.ref} />
{:else if draft.valueType === 'BOOLEAN'}
	<div class="row">
		<label class="option"><input type="radio" bind:group={draft.bool} value={true} /> да</label>
		<label class="option"><input type="radio" bind:group={draft.bool} value={false} /> нет</label>
	</div>
{/if}

<style>
	.nowrap {
		flex-wrap: nowrap;
		gap: 0.4rem;
	}
	.unit {
		max-width: 5rem;
	}
	.options {
		gap: 0.4rem 1rem;
	}
	.option {
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		color: var(--text);
		font-size: 1rem;
	}
</style>
