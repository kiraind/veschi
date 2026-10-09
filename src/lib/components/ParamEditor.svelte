<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import {
		draftFromView,
		draftToInput,
		emptyDraft,
		type ParamDraft
	} from '$lib/domain/param-draft';
	import {
		PARAM_VALUE_TYPES,
		PARAM_VALUE_TYPE_LABELS,
		paramListSchema,
		type ParamInput,
		type ParamView
	} from '$lib/domain/params';
	import type { DictionaryView } from '$lib/server/services/dictionaries';
	import ParamValueInput from './ParamValueInput.svelte';

	/** Edits a whole parameter list and saves it in one call. */
	let {
		initial,
		onsave
	}: { initial: ParamView[]; onsave: (params: ParamInput[]) => Promise<void> } = $props();

	// The drafts start from the saved list once and then live on their own.
	// svelte-ignore state_referenced_locally
	let drafts = $state<ParamDraft[]>(initial.map(draftFromView));
	let dictionaries = $state<DictionaryView[] | null>(null);
	let rowErrors = $state<Record<number, string>>({});
	let error = $state('');
	let saving = $state(false);
	let saved = $state(false);

	const needsDictionaries = $derived(drafts.some((d) => d.valueType === 'ENUM'));
	$effect(() => {
		if (needsDictionaries && dictionaries === null) {
			api.get<DictionaryView[]>('/api/dictionaries').then((list) => (dictionaries = list));
		}
	});

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= drafts.length) return;
		[drafts[index], drafts[target]] = [drafts[target]!, drafts[index]!];
	}

	/** Maps zod issues (path [row, field]) to messages per row. */
	function issuesByRow(issues: { path: PropertyKey[]; message: string }[]) {
		const byRow: Record<number, string> = {};
		for (const issue of issues) {
			const row = issue.path[0];
			if (typeof row === 'number') byRow[drafts[row]!.uid] ??= issue.message;
		}
		return byRow;
	}

	async function save() {
		error = '';
		saved = false;
		const parsed = paramListSchema.safeParse(drafts.map(draftToInput));
		if (!parsed.success) {
			rowErrors = issuesByRow(parsed.error.issues);
			error = 'Исправьте отмеченные параметры';
			return;
		}
		rowErrors = {};
		saving = true;
		try {
			await onsave(parsed.data);
			saved = true;
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="stack">
	{#each drafts as draft, i (draft.uid)}
		<div class="card stack param" class:invalid={rowErrors[draft.uid]}>
			<div class="row nowrap">
				<input
					class="key"
					bind:value={draft.key}
					placeholder="Ключ, например «корпус»"
					aria-label="Ключ"
				/>
				<select bind:value={draft.valueType} aria-label="Тип значения">
					{#each PARAM_VALUE_TYPES as type (type)}
						<option value={type}>{PARAM_VALUE_TYPE_LABELS[type]}</option>
					{/each}
				</select>
			</div>
			<ParamValueInput bind:draft={drafts[i]!} {dictionaries} />
			{#if rowErrors[draft.uid]}<p class="error">{rowErrors[draft.uid]}</p>{/if}
			<div class="row actions">
				<button type="button" onclick={() => move(i, -1)} disabled={i === 0} title="Выше">↑</button>
				<button
					type="button"
					onclick={() => move(i, 1)}
					disabled={i === drafts.length - 1}
					title="Ниже">↓</button
				>
				<button type="button" class="danger" onclick={() => drafts.splice(i, 1)}>Удалить</button>
			</div>
		</div>
	{/each}

	<div class="row">
		<button type="button" onclick={() => drafts.push(emptyDraft())}>+ Параметр</button>
		<button type="button" class="primary" onclick={save} disabled={saving}>
			{saving ? 'Сохранение…' : 'Сохранить параметры'}
		</button>
		{#if saved}<span class="muted">Сохранено</span>{/if}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	.param {
		padding: 0.75rem;
	}
	.invalid {
		border-color: var(--danger);
	}
	.nowrap {
		flex-wrap: nowrap;
		gap: 0.4rem;
	}
	.key {
		flex: 1;
		min-width: 0;
	}
	select {
		width: auto;
		max-width: 45%;
	}
	.actions {
		justify-content: flex-end;
		gap: 0.4rem;
	}
</style>
