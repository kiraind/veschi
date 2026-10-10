<script lang="ts">
	import { Button, Card, Input, Select } from 'flowbite-svelte';
	import {
		ArrowDownOutline,
		ArrowUpOutline,
		PlusOutline,
		TrashBinOutline
	} from 'flowbite-svelte-icons';
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

<div class="flex flex-col gap-3">
	{#each drafts as draft, i (draft.uid)}
		<Card
			class="max-w-none gap-2 p-3 {rowErrors[draft.uid]
				? 'border-red-500 dark:border-red-500'
				: ''}"
		>
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="min-w-0 flex-1">
					<Input bind:value={draft.key} placeholder="Ключ, например «корпус»" aria-label="Ключ" />
				</div>
				<div class="sm:w-48 sm:shrink-0">
					<Select bind:value={draft.valueType} aria-label="Тип значения" placeholder="">
						{#each PARAM_VALUE_TYPES as type (type)}
							<option value={type}>{PARAM_VALUE_TYPE_LABELS[type]}</option>
						{/each}
					</Select>
				</div>
			</div>
			<ParamValueInput bind:draft={drafts[i]!} {dictionaries} />
			{#if rowErrors[draft.uid]}<p class="text-sm text-red-600 dark:text-red-500">
					{rowErrors[draft.uid]}
				</p>{/if}
			<div class="flex flex-wrap justify-end gap-1.5">
				<Button
					color="alternative"
					class="h-10 w-10 p-0"
					type="button"
					onclick={() => move(i, -1)}
					disabled={i === 0}
					title="Выше"
					aria-label="Выше"><ArrowUpOutline class="h-4 w-4" /></Button
				>
				<Button
					color="alternative"
					class="h-10 w-10 p-0"
					type="button"
					onclick={() => move(i, 1)}
					disabled={i === drafts.length - 1}
					title="Ниже"
					aria-label="Ниже"><ArrowDownOutline class="h-4 w-4" /></Button
				>
				<Button
					color="red"
					outline
					class="h-10"
					size="sm"
					type="button"
					onclick={() => drafts.splice(i, 1)}
				>
					<TrashBinOutline class="me-1 h-4 w-4" />Удалить
				</Button>
			</div>
		</Card>
	{/each}

	<div class="flex flex-wrap items-center gap-2">
		<Button color="alternative" type="button" onclick={() => drafts.push(emptyDraft())}>
			<PlusOutline class="me-1 h-4 w-4" />Параметр
		</Button>
		<Button type="button" onclick={save} disabled={saving}>
			{saving ? 'Сохранение…' : 'Сохранить параметры'}
		</Button>
		{#if saved}<span class="text-sm text-gray-500 dark:text-gray-400">Сохранено</span>{/if}
	</div>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
</div>
