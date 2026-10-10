<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
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
		type ParamView
	} from '$lib/domain/params';
	import { confirmAction } from '$lib/confirm.svelte';
	import { inCategories, type RequiredParam } from '$lib/domain/categories';
	import ParamDefPicker from './ParamDefPicker.svelte';
	import ParamValueInput from './ParamValueInput.svelte';
	import ParamValueView from './ParamValueView.svelte';

	/**
	 * The parameter list of a type or an item, edited in place: a pen on each
	 * row edits its value, «Параметр» adds one. An item card shows two of
	 * these: the item's own values and its type's (changing those changes the
	 * type, so every item of it). Values the type's categories require cannot
	 * be removed; required values not filled yet are listed as «не заполнено».
	 */
	let {
		params,
		target,
		editable = true,
		exclude = [],
		emptyText = 'Параметров нет.',
		required = [],
		missing = []
	}: {
		params: ParamView[];
		target: { kind: 'type' | 'item'; id: string };
		editable?: boolean;
		/** Parameters not offered when adding (besides those already in the list). */
		exclude?: string[];
		/** Shown when there are no parameters; empty → nothing (just «Параметр»). */
		emptyText?: string;
		/** Required by categories here: such values cannot be removed. */
		required?: RequiredParam[];
		/** Required values not filled yet (shown at the top of the list). */
		missing?: RequiredParam[];
	} = $props();

	const requiredBy = $derived(new Map(required.map((r) => [r.def.id, r.categories])));

	let editingId = $state<string | null>(null);
	let adding = $state(false);
	let draft = $state<ParamDraft | null>(null);
	/** Definition of the edited value, for drop-down options (loaded on demand). */
	let def = $state<ParamDefView | null>(null);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		const defId = draft?.valueType === 'ENUM' ? draft.defId : null;
		if (!defId || def?.id === defId) return;
		api
			.get<{ def: ParamDefView }>(`/api/param-defs/${defId}`)
			.then((card) => {
				if (draft?.defId === defId) def = card.def;
			})
			.catch((e) => (error = e instanceof ApiError ? e.message : String(e)));
	});

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
	}

	function startAdding() {
		close();
		adding = true;
	}

	/** Opens the editor of a required value not filled yet, in place of its row. */
	function fill(r: RequiredParam) {
		close();
		adding = true;
		pickDef(r.def);
	}

	function pickDef(picked: ParamDefView) {
		def = picked;
		draft = emptyDraft(picked);
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

	function save(param: ParamView) {
		const input = parsedDraft();
		if (input) run(() => api.put(`/api/params/${param.id}`, input));
	}

	function saveNew() {
		const input = parsedDraft();
		if (!input) return;
		run(() =>
			api.post(`/api/${target.kind === 'type' ? 'types' : 'items'}/${target.id}/params`, input)
		);
	}

	async function remove(param: ParamView) {
		if (await confirmAction({ title: `Удалить параметр «${param.key}»?` })) {
			run(() => api.delete(`/api/params/${param.id}`));
		}
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

	function canMove(index: number, delta: -1 | 1): boolean {
		return Boolean(params[index + delta]);
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
			<ParamValueInput bind:draft def={def?.id === draft.defId ? def : null} />
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
				{#if ondelete && requiredBy.has(draft.defId)}
					<span class="ms-auto text-sm text-gray-500 dark:text-gray-400">
						Обязателен {inCategories(requiredBy.get(draft.defId) ?? [])}
					</span>
				{:else if ondelete}
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
	{#each missing as r (r.def.id)}
		{#if adding && draft?.defId === r.def.id}
			{@render editor(saveNew, null, null)}
		{:else}
			<div class="grid grid-cols-[minmax(6rem,40%)_1fr_auto] items-center gap-x-3">
				<div class="text-gray-500 dark:text-gray-400 [overflow-wrap:anywhere]">{r.def.name}</div>
				<div class="min-w-0 text-amber-700 dark:text-amber-400">
					не заполнено
					<span class="block text-xs text-gray-500 dark:text-gray-400">
						обязателен {inCategories(r.categories)}
					</span>
				</div>
				{#if editable}
					<div class="flex">
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-gray-700"
							onclick={() => fill(r)}
							title="Заполнить"
							aria-label="Заполнить «{r.def.name}»"><PenOutline class="h-5 w-5" /></button
						>
					</div>
				{/if}
			</div>
		{/if}
	{/each}
	{#if params.length === 0 && missing.length === 0 && !adding && emptyText}
		<p class="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
	{/if}
	{#each params as param, i (param.id)}
		{#if editingId === param.id}
			{@render editor(
				() => save(param),
				() => remove(param),
				i
			)}
		{:else}
			<div class="grid grid-cols-[minmax(6rem,40%)_1fr_auto] items-center gap-x-3">
				<div class="text-gray-500 dark:text-gray-400 [overflow-wrap:anywhere]">
					{param.key}
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
		{#if missing.some((r) => r.def.id === draft?.defId)}
			<!-- Filled in place of its «не заполнено» row above. -->
		{:else if draft}
			{@render editor(saveNew, null, null)}
		{:else}
			<ParamDefPicker
				onpick={pickDef}
				oncancel={close}
				exclude={[...params.map((p) => p.defId), ...missing.map((r) => r.def.id), ...exclude]}
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
