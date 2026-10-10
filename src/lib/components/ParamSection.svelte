<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Checkbox } from 'flowbite-svelte';
	import {
		ArrowDownOutline,
		ArrowUpOutline,
		PenOutline,
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
		PARAM_VALUE_TYPE_LABELS,
		paramInputSchema,
		type ParamDefView,
		type ParamSource,
		type ParamView
	} from '$lib/domain/params';
	import type { DictionaryView } from '$lib/server/services/dictionaries';
	import ParamDefPicker from './ParamDefPicker.svelte';
	import ParamValueInput from './ParamValueInput.svelte';
	import ParamValueView from './ParamValueView.svelte';

	/**
	 * The parameter list of a type or an item, edited in place: a pen on each
	 * row edits its value, «Параметр» adds one. On an item card the list is the
	 * merged one; values inherited from the type are marked, editing them
	 * changes the type unless «Только для этой вещи» is ticked.
	 */
	let {
		params,
		target,
		type = null,
		editable = true
	}: {
		params: (ParamView & { source?: ParamSource })[];
		target: { kind: 'type' | 'item'; id: string };
		/** Item cards: the item's type, for values shared through it. */
		type?: { id: string; name: string } | null;
		editable?: boolean;
	} = $props();

	let editingId = $state<string | null>(null);
	let adding = $state(false);
	let draft = $state<ParamDraft | null>(null);
	/** Editing a type value from an item card: save it as this item's own value. */
	let onlyHere = $state(false);
	/** Adding on an item card: the value goes to the type. */
	let forType = $state(false);
	let dictionaries = $state<DictionaryView[] | null>(null);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (draft?.valueType === 'ENUM' && dictionaries === null) {
			api.get<DictionaryView[]>('/api/dictionaries').then((list) => (dictionaries = list));
		}
	});

	const onItem = $derived(target.kind === 'item');

	function close() {
		editingId = null;
		adding = false;
		draft = null;
		error = '';
	}

	function edit(param: ParamView) {
		close();
		editingId = param.id;
		draft = draftFromView(param);
		onlyHere = false;
	}

	function startAdding() {
		close();
		adding = true;
		forType = false;
	}

	function pickDef(def: ParamDefView) {
		draft = emptyDraft(def);
	}

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			close();
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function parsedDraft() {
		if (!draft) return null;
		const parsed = paramInputSchema.safeParse(draftToInput(draft));
		if (!parsed.success) {
			error = parsed.error.issues[0]?.message ?? 'Проверьте значение';
			return null;
		}
		return parsed.data;
	}

	function save(param: ParamView & { source?: ParamSource }) {
		const input = parsedDraft();
		if (!input) return;
		if (onItem && param.source === 'type' && onlyHere) {
			run(() => api.post(`/api/items/${target.id}/params`, input));
		} else {
			run(() => api.put(`/api/params/${param.id}`, input));
		}
	}

	function saveNew() {
		const input = parsedDraft();
		if (!input) return;
		const url =
			onItem && forType && type
				? `/api/types/${type.id}/params`
				: `/api/${target.kind === 'type' ? 'types' : 'items'}/${target.id}/params`;
		run(() => api.post(url, input));
	}

	function remove(param: ParamView & { source?: ParamSource }) {
		const question =
			onItem && param.source === 'type'
				? `Удалить «${param.key}» у типа «${type?.name}» — у всех его вещей?`
				: `Удалить «${param.key}»?`;
		if (confirm(question)) run(() => api.delete(`/api/params/${param.id}`));
	}

	/** Moves the edited value; the editor stays open. */
	async function move(param: ParamView, delta: -1 | 1) {
		busy = true;
		error = '';
		try {
			await api.post(`/api/params/${param.id}/move`, { delta });
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** Neighbours in the same list (type values and own values are ordered separately). */
	function canMove(index: number, delta: -1 | 1): boolean {
		const source = params[index]?.source;
		const other = params[index + delta];
		return Boolean(other) && other?.source === source;
	}
</script>

{#snippet editor(onsave: () => void, ondelete: (() => void) | null, index: number | null)}
	{#if draft}
		<div class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<span class="font-medium break-words">{draft.key}</span>
				<span class="text-sm text-gray-500 dark:text-gray-400">
					{PARAM_VALUE_TYPE_LABELS[draft.valueType]}
				</span>
			</div>
			<ParamValueInput bind:draft {dictionaries} />
			{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
			<div class="flex flex-wrap items-center gap-2">
				<Button type="button" onclick={onsave} disabled={busy}>Сохранить</Button>
				<Button type="button" color="alternative" onclick={close} disabled={busy}>Отмена</Button>
				{#if index !== null && params[index]}
					{@const param = params[index]}
					<Button
						type="button"
						color="alternative"
						class="h-10 w-10 p-0"
						onclick={() => move(param, -1)}
						disabled={busy || !canMove(index, -1)}
						title="Выше"
						aria-label="Выше"><ArrowUpOutline class="h-4 w-4" /></Button
					>
					<Button
						type="button"
						color="alternative"
						class="h-10 w-10 p-0"
						onclick={() => move(param, 1)}
						disabled={busy || !canMove(index, 1)}
						title="Ниже"
						aria-label="Ниже"><ArrowDownOutline class="h-4 w-4" /></Button
					>
				{/if}
				{#if ondelete}
					<Button
						type="button"
						color="red"
						outline
						class="ms-auto h-10 w-10 p-0"
						onclick={ondelete}
						disabled={busy}
						title="Удалить"
						aria-label="Удалить"><TrashBinOutline class="h-5 w-5" /></Button
					>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

<div class="flex flex-col gap-2">
	{#if params.length === 0 && !adding}
		<p class="text-sm text-gray-500 dark:text-gray-400">Параметров нет.</p>
	{/if}
	{#each params as param, i (param.id)}
		{#if editingId === param.id}
			{#if onItem && param.source === 'type'}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Значение общее для всех вещей типа «{type?.name}».
				</p>
				<Checkbox bind:checked={onlyHere}>Только для этой вещи</Checkbox>
			{/if}
			{@render editor(
				() => save(param),
				() => remove(param),
				i
			)}
		{:else}
			<div class="grid grid-cols-[minmax(6rem,40%)_1fr_auto] items-center gap-x-3">
				<div class="text-gray-500 dark:text-gray-400 [overflow-wrap:anywhere]">
					{param.key}
					{#if onItem && param.source === 'type'}<span class="text-sm" title="Значение типа"
							>· тип</span
						>{/if}
				</div>
				<div class="min-w-0 [overflow-wrap:anywhere]"><ParamValueView {param} /></div>
				{#if editable}
					<div class="flex">
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
							onclick={() => edit(param)}
							title="Изменить"
							aria-label="Изменить «{param.key}»"><PenOutline class="h-5 w-5" /></button
						>
					</div>
				{/if}
			</div>
		{/if}
	{/each}

	{#if adding}
		{#if draft}
			{#if onItem && type}
				<Checkbox bind:checked={forType}>Для всех вещей типа «{type.name}»</Checkbox>
			{/if}
			{@render editor(saveNew, null, null)}
		{:else}
			<ParamDefPicker
				onpick={pickDef}
				oncancel={close}
				exclude={params.filter((p) => !onItem || p.source !== 'type').map((p) => p.defId)}
			/>
		{/if}
	{:else if editable}
		<div>
			<Button color="alternative" size="sm" class="h-10" onclick={startAdding}>
				<PlusOutline class="me-1 h-4 w-4" />Параметр
			</Button>
		</div>
	{/if}
</div>
