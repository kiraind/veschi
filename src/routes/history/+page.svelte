<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Badge, Button, Card, Label, Select } from 'flowbite-svelte';
	import { ArchiveOutline, CloseOutline } from 'flowbite-svelte-icons';
	import { api, errorText } from '$lib/api';
	import { formatIsoDate, formatIsoDateTime } from '$lib/domain/dates';
	import {
		HISTORY_GROUPS,
		SUBJECT_LABELS,
		describeEvent,
		historyHref,
		historySearch,
		type HistoryEventView,
		type HistoryPage,
		type HistoryFilters,
		type HistoryGroup,
		type Segment,
		type SubjectKind
	} from '$lib/domain/history';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Older pages loaded with «Показать ещё», for the current first page only. */
	let more = $state<{ of: HistoryPage | null; events: HistoryEventView[]; cursor: string | null }>({
		of: null,
		events: [],
		cursor: null
	});
	let loading = $state(false);
	let error = $state<string | null>(null);

	const current = $derived(more.of === data.page);
	const events = $derived(current ? [...data.page.events, ...more.events] : data.page.events);
	const cursor = $derived(current ? more.cursor : data.page.nextCursor);

	/**
	 * Dates and times are local to the device. The server renders them in its own
	 * time zone (often UTC), so they are worked out again once the page is in the browser.
	 */
	let inBrowser = $state(false);
	onMount(() => (inBrowser = true));

	/** Events grouped by local date, newest first. */
	const days = $derived.by(() => {
		void inBrowser;
		const result: { date: string; events: HistoryEventView[] }[] = [];
		for (const e of events) {
			const date = formatIsoDate(e.createdAt);
			const last = result.at(-1);
			if (last?.date === date) last.events.push(e);
			else result.push({ date, events: [e] });
		}
		return result;
	});

	const groupKeys = Object.keys(HISTORY_GROUPS) as HistoryGroup[];
	const subjectKeys = Object.keys(SUBJECT_LABELS) as SubjectKind[];

	function setFilter(patch: Partial<HistoryFilters>) {
		goto(historyHref({ ...data.filters, ...patch }), {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	async function loadMore() {
		if (!cursor) return;
		loading = true;
		error = null;
		// The filter can change while the page loads: its events then belong to no list.
		const of = data.page;
		try {
			const page = await api.get<HistoryPage>(
				`/api/history${historySearch(data.filters, { before: cursor })}`
			);
			if (of !== data.page) return;
			more = {
				of,
				events: [...(current ? more.events : []), ...page.events],
				cursor: page.nextCursor
			};
		} catch (e) {
			if (of === data.page) error = errorText(e);
		} finally {
			loading = false;
		}
	}

	const time = $derived(inBrowser ? localTime : (d: Date | string) => localTime(d));

	function localTime(d: Date | string): string {
		return formatIsoDateTime(d).slice(11);
	}
</script>

<svelte:head><title>История — veschi</title></svelte:head>

{#snippet segments(list: Segment[])}
	{#each list as s, i (i)}
		{#if s.href}
			<a href={s.href} class="text-primary-700 hover:underline dark:text-primary-400">{s.text}</a>
		{:else}{s.text}{/if}
	{/each}
{/snippet}

<div class="mb-3 flex items-center justify-between gap-3">
	<h1 class="text-2xl font-bold">История</h1>
	<Button href="/archive" size="sm" color="alternative" class="h-10 shrink-0 gap-1.5">
		<ArchiveOutline class="h-4 w-4" />
		Архив
	</Button>
</div>

<div
	class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1"
	role="group"
	aria-label="Что показывать"
>
	<Button
		size="xs"
		pill
		class="h-10 shrink-0"
		color={data.filters.group ? 'alternative' : 'primary'}
		onclick={() => setFilter({ group: null })}>Всё</Button
	>
	{#each groupKeys as key (key)}
		<Button
			size="xs"
			pill
			class="h-10 shrink-0"
			color={data.filters.group === key ? 'primary' : 'alternative'}
			aria-pressed={data.filters.group === key}
			onclick={() => setFilter({ group: data.filters.group === key ? null : key })}
		>
			{HISTORY_GROUPS[key]}
		</Button>
	{/each}
</div>

<div class="mb-3 grid grid-cols-2 gap-2">
	<Label class="text-sm">
		О чём
		<Select
			class="mt-1"
			size="sm"
			placeholder=""
			value={data.filters.subject ?? ''}
			onchange={(e) =>
				setFilter({
					subject: ((e.currentTarget as HTMLSelectElement).value || null) as SubjectKind | null
				})}
		>
			<option value="">Обо всём</option>
			{#each subjectKeys as key (key)}
				<option value={key}>{SUBJECT_LABELS[key]}</option>
			{/each}
		</Select>
	</Label>
	<Label class="text-sm">
		Кто
		<Select
			class="mt-1"
			size="sm"
			placeholder=""
			value={data.filters.actor ?? ''}
			onchange={(e) => setFilter({ actor: (e.currentTarget as HTMLSelectElement).value || null })}
		>
			<option value="">Все</option>
			{#each data.actors as person (person.id)}
				<option value={person.id}>{person.name}</option>
			{/each}
			{#if data.filters.actor && !data.actors.some((a) => a.id === data.filters.actor)}
				<option value={data.filters.actor}>Неизвестно кто</option>
			{/if}
		</Select>
	</Label>
</div>

{#if data.entity}
	<div class="mb-3 flex items-center gap-2 text-sm">
		<span class="text-gray-500 dark:text-gray-400">Только про</span>
		<Badge color="primary" large class="gap-1">
			<span class="wrap-anywhere">{data.entity.name}</span>
			<button
				type="button"
				class="-my-2 -me-2 flex h-10 w-10 items-center justify-center rounded hover:bg-primary-200 dark:hover:bg-primary-800"
				aria-label="Показать всю историю"
				onclick={() => setFilter({ entity: null })}
			>
				<CloseOutline class="h-3.5 w-3.5" />
			</button>
		</Badge>
	</div>
{/if}

{#if events.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">
		{data.filters.entity || data.filters.actor || data.filters.group || data.filters.subject
			? 'Ничего не найдено — попробуйте убрать фильтры.'
			: 'История пока пуста.'}
	</p>
{:else}
	<div class="flex flex-col gap-4">
		{#each days as day (day.date)}
			<section>
				<h2 class="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{day.date}</h2>
				<Card class="max-w-none divide-y divide-gray-200 p-0 dark:divide-gray-700">
					{#each day.events as event (event.id)}
						{@const text = describeEvent(event)}
						<div class="px-4 py-3">
							<p class="wrap-anywhere">{@render segments(text.title)}</p>
							{#each text.details as line, i (i)}
								<p class="mt-0.5 text-sm wrap-anywhere text-gray-600 dark:text-gray-300">
									{@render segments(line)}
								</p>
							{/each}
							<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								{time(event.createdAt)}
								{#if event.actor}· {event.actor.name}{/if}
								{#if event.data.backfilled}· восстановлено по данным{/if}
							</p>
						</div>
					{/each}
				</Card>
			</section>
		{/each}
	</div>
	{#if cursor}
		<div class="mt-4 flex justify-center">
			<Button color="alternative" onclick={loadMore} disabled={loading}>Показать ещё</Button>
		</div>
	{/if}
	{#if error}
		<p class="mt-2 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>
	{/if}
{/if}
