<script lang="ts">
	import { Button, Card, Input } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import { api, ApiError } from '$lib/api';
	import {
		normalizeParamKey,
		paramKindLabel,
		type ParamDefView,
		type ParamValueType
	} from '$lib/domain/params';
	import ParamDefFields from './ParamDefFields.svelte';

	/**
	 * Chooses a parameter: search the existing ones by name or create a new one
	 * (name, value type, unit or drop-down options) right here.
	 */
	let {
		onpick,
		oncancel,
		exclude = []
	}: {
		onpick: (def: ParamDefView) => void;
		oncancel: () => void;
		/** Parameters the list already has. */
		exclude?: string[];
	} = $props();

	let defs = $state<ParamDefView[] | null>(null);
	let query = $state('');
	let creating = $state(false);
	let valueType = $state<ParamValueType>('STRING');
	let unit = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		api.get<ParamDefView[]>('/api/param-defs').then((list) => (defs = list));
	});

	const q = $derived(normalizeParamKey(query));
	const matches = $derived(
		(defs ?? [])
			.filter((d) => !exclude.includes(d.id) && normalizeParamKey(d.name).includes(q))
			.slice(0, q ? 8 : 12)
	);
	const exact = $derived((defs ?? []).find((d) => normalizeParamKey(d.name) === q));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const def = await api.post<ParamDefView>('/api/param-defs', {
				name: query,
				valueType,
				unit,
				multiple,
				options
			});
			onpick(def);
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<Card class="max-w-none gap-3 p-3">
	{#if !creating}
		<Input
			type="search"
			bind:value={query}
			placeholder="Найти параметр или ввести новый"
			aria-label="Параметр"
			autocomplete="off"
		/>
		{#if defs === null}
			<p class="text-sm text-gray-500 dark:text-gray-400">Загрузка…</p>
		{:else}
			{#if matches.length > 0}
				<ul
					class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
				>
					{#each matches as def (def.id)}
						<li>
							<button
								type="button"
								class="flex min-h-11 w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
								onclick={() => onpick(def)}
							>
								<span class="break-words">{def.name}</span>
								<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400">
									{paramKindLabel(def)}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if !q}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Параметров пока нет — введите название нового.
				</p>
			{/if}
			{#if exact && exclude.includes(exact.id)}
				<p class="text-sm text-gray-500 dark:text-gray-400">«{exact.name}» уже есть в списке.</p>
			{/if}
		{/if}
		<div class="flex flex-wrap gap-2">
			{#if q && !exact}
				<Button type="button" onclick={() => (creating = true)}>
					<PlusOutline class="me-1 h-4 w-4" />Новый параметр «{query.trim()}»
				</Button>
			{/if}
			<Button type="button" color="alternative" onclick={oncancel}>Отмена</Button>
		</div>
	{:else}
		<form class="flex flex-col gap-3" onsubmit={create}>
			<ParamDefFields bind:name={query} bind:valueType bind:unit bind:multiple bind:options />
			{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy || (valueType === 'ENUM' && options.length === 0)}>
					Создать
				</Button>
				<Button type="button" color="alternative" onclick={() => (creating = false)}>Назад</Button>
			</div>
		</form>
	{/if}
</Card>
