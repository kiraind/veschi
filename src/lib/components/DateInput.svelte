<!--
@component
Date field shown and typed as ISO «ГГГГ-ММ-ДД» regardless of the browser locale,
with a Monday-first Russian calendar popover. `value` is 'YYYY-MM-DD' or ''.
Usage: `<DateInput bind:value aria-label="Дата" />`.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Input } from 'flowbite-svelte';
	import {
		CalendarMonthOutline,
		ChevronDoubleLeftOutline,
		ChevronDoubleRightOutline,
		ChevronLeftOutline,
		ChevronRightOutline
	} from 'flowbite-svelte-icons';
	import {
		MONTH_NAMES,
		WEEKDAY_NAMES,
		formatIsoDate,
		isoFromParts,
		monthGrid,
		normalizeDateInput,
		parseIsoDate,
		shiftMonth
	} from '$lib/domain/dates';

	let {
		value = $bindable(''),
		id,
		placeholder = 'ГГГГ-ММ-ДД',
		'aria-label': ariaLabel,
		disabled = false,
		required = false
	}: {
		value?: string;
		id?: string;
		placeholder?: string;
		'aria-label'?: string;
		disabled?: boolean;
		required?: boolean;
	} = $props();

	const uid = $props.id();
	const calendarId = `${uid}-calendar`;
	const errorId = `${uid}-error`;

	let text = $state(untrack(() => value ?? ''));
	let error = $state('');
	let open = $state(false);
	let view = $state({ year: 2000, month: 1 });
	let container = $state<HTMLDivElement>();
	let inputEl = $state<HTMLInputElement>();
	let toggleEl = $state<HTMLButtonElement>();

	// A value set from outside (or by the calendar) replaces the text, unless the
	// text already means that date (e.g. «2026-1-5» while typing).
	$effect(() => {
		const v = value ?? '';
		untrack(() => {
			if (normalizeDateInput(text) !== v) {
				text = v;
				setError('');
			}
		});
	});

	const today = $derived(formatIsoDate(new Date()));
	const cells = $derived(monthGrid(view.year, view.month));

	function setError(message: string) {
		error = message;
		inputEl?.setCustomValidity(message);
	}

	// Read the element itself: don't rely on bind:value having run before this handler.
	function onInput(event: Event) {
		text = (event.currentTarget as HTMLInputElement).value;
		const normalized = normalizeDateInput(text);
		if (normalized !== null) {
			value = normalized;
			setError('');
		}
	}

	function onChange(event: Event) {
		text = (event.currentTarget as HTMLInputElement).value;
		const normalized = normalizeDateInput(text);
		if (normalized === null) {
			setError('Введите дату как ГГГГ-ММ-ДД, например 2026-10-10');
		} else {
			text = normalized;
			value = normalized;
			setError('');
		}
	}

	function showMonthOf(iso: string) {
		const parts = parseIsoDate(iso) ?? parseIsoDate(today)!;
		view = { year: parts.year, month: parts.month };
	}

	function toggle() {
		if (!open) showMonthOf(value);
		open = !open;
	}

	function close(focusToggle = false) {
		open = false;
		if (focusToggle) toggleEl?.focus();
	}

	function pick(iso: string) {
		value = iso;
		text = iso;
		setError('');
		close(true);
	}

	function move(deltaMonths: number) {
		view = shiftMonth(view.year, view.month, deltaMonths);
	}

	function onDocumentPointerDown(event: PointerEvent) {
		if (open && container && !container.contains(event.target as Node)) close();
	}

	function onKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			close(true);
		}
	}

	const navButton =
		'flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus:ring-2 focus:ring-gray-200 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-600 dark:focus:ring-gray-600';
	const footerButton =
		'min-h-10 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-gray-100 focus:ring-2 focus:ring-gray-200 focus:outline-none dark:text-primary-400 dark:hover:bg-gray-600 dark:focus:ring-gray-600';
</script>

<svelte:document onpointerdown={onDocumentPointerDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" bind:this={container} onkeydown={onKeydown}>
	<Input
		{id}
		type="text"
		bind:value={text}
		bind:elementRef={inputEl}
		oninput={onInput}
		onchange={onChange}
		{placeholder}
		aria-label={ariaLabel}
		aria-invalid={error ? true : undefined}
		aria-describedby={error ? errorId : undefined}
		autocomplete="off"
		spellcheck={false}
		maxlength={10}
		{disabled}
		{required}
		class="pe-12 font-mono"
	/>
	<button
		type="button"
		bind:this={toggleEl}
		class="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-lg text-gray-500 hover:text-gray-900 focus:ring-2 focus:ring-primary-300 focus:outline-none disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-white dark:focus:ring-primary-800"
		onclick={toggle}
		{disabled}
		aria-label="Выбрать в календаре"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={open ? calendarId : undefined}
	>
		<CalendarMonthOutline class="h-5 w-5" />
	</button>

	{#if open}
		<div
			id={calendarId}
			role="dialog"
			aria-label="Календарь"
			class="absolute start-0 top-full z-20 mt-1 w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-700"
		>
			<div class="mb-2 flex items-center justify-between">
				<div class="flex">
					<button type="button" class={navButton} onclick={() => move(-12)} aria-label="Год назад">
						<ChevronDoubleLeftOutline class="h-4 w-4" />
					</button>
					<button type="button" class={navButton} onclick={() => move(-1)} aria-label="Месяц назад">
						<ChevronLeftOutline class="h-4 w-4" />
					</button>
				</div>
				<span class="text-sm font-semibold text-gray-900 dark:text-white" aria-live="polite">
					{MONTH_NAMES[view.month - 1]}
					{view.year}
				</span>
				<div class="flex">
					<button type="button" class={navButton} onclick={() => move(1)} aria-label="Месяц вперёд">
						<ChevronRightOutline class="h-4 w-4" />
					</button>
					<button type="button" class={navButton} onclick={() => move(12)} aria-label="Год вперёд">
						<ChevronDoubleRightOutline class="h-4 w-4" />
					</button>
				</div>
			</div>
			<div class="grid grid-cols-7 text-center">
				{#each WEEKDAY_NAMES as day, i (day)}
					<span
						class={[
							'pb-1 text-xs font-medium',
							i >= 5 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
						]}>{day}</span
					>
				{/each}
				{#each cells as day, i (i)}
					{#if day === null}
						<span></span>
					{:else}
						{@const iso = isoFromParts({ year: view.year, month: view.month, day })}
						{@const selected = iso === value}
						<button
							type="button"
							class={[
								'h-10 rounded-lg text-sm focus:ring-2 focus:ring-primary-300 focus:outline-none dark:focus:ring-primary-800',
								selected
									? 'bg-primary-700 font-semibold text-white hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700'
									: 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600',
								!selected &&
									iso === today &&
									'font-bold text-primary-700 ring-1 ring-primary-700 ring-inset dark:text-primary-400 dark:ring-primary-400'
							]}
							aria-label={iso}
							aria-pressed={selected}
							aria-current={iso === today ? 'date' : undefined}
							onclick={() => pick(iso)}
						>
							{day}
						</button>
					{/if}
				{/each}
			</div>
			<div class="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-gray-600">
				<button type="button" class={footerButton} onclick={() => pick(today)}>Сегодня</button>
				{#if value}
					<button type="button" class={footerButton} onclick={() => pick('')}>Очистить</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
{#if error}
	<p id={errorId} class="mt-1 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>
{/if}
