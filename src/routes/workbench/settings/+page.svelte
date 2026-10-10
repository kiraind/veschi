<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { Button, Card, Input, Label } from 'flowbite-svelte';
	import { ArrowLeftOutline, MapPinOutline, PlusOutline } from 'flowbite-svelte-icons';
	import WorkbenchIcon from '$lib/components/WorkbenchIcon.svelte';
	import {
		WORKBENCH_ICONS,
		workbenchIconKey,
		workbenchIconLabel,
		type WorkbenchIconKey
	} from '$lib/domain/workbench-icons';
	import type { PageData } from './$types';
	import { confirmAction } from '$lib/confirm.svelte';

	let { data }: { data: PageData } = $props();

	interface Draft {
		/** null = a new bench. */
		id: string | null;
		name: string;
		geoLat: number | null;
		geoLng: number | null;
		geoRadiusM: number | null;
		icon: WorkbenchIconKey;
	}

	const DEFAULT_RADIUS_M = 100;

	let draft = $state<Draft | null>(null);
	let busy = $state(false);
	let locating = $state(false);
	let error = $state('');

	function edit(bench?: PageData['workbenches'][number]) {
		error = '';
		draft = bench
			? {
					id: bench.id,
					name: bench.name,
					geoLat: bench.geoLat,
					geoLng: bench.geoLng,
					geoRadiusM: bench.geoRadiusM,
					icon: workbenchIconKey(bench.icon)
				}
			: {
					id: null,
					name: '',
					geoLat: null,
					geoLng: null,
					geoRadiusM: null,
					icon: workbenchIconKey(null)
				};
	}

	function useCurrentPlace() {
		if (!draft) return;
		if (!navigator.geolocation) {
			error = 'Браузер не умеет определять местоположение';
			return;
		}
		locating = true;
		error = '';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = false;
				if (!draft) return;
				draft.geoLat = p.coords.latitude;
				draft.geoLng = p.coords.longitude;
				draft.geoRadiusM ??= DEFAULT_RADIUS_M;
			},
			(e) => {
				locating = false;
				error =
					e.code === e.PERMISSION_DENIED
						? 'Доступ к местоположению запрещён'
						: 'Не удалось определить местоположение';
			},
			{ enableHighAccuracy: true, timeout: 15_000 }
		);
	}

	function clearZone() {
		if (!draft) return;
		draft.geoLat = draft.geoLng = draft.geoRadiusM = null;
	}

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			draft = null;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (!draft) return;
		const { id, ...body } = draft;
		const zone = body.geoLat !== null ? body : { ...body, geoRadiusM: null };
		return run(() =>
			id ? api.put(`/api/workbenches/${id}`, zone) : api.post('/api/workbenches', zone)
		);
	}

	async function remove(bench: { id: string; name: string }) {
		if (!(await confirmAction({ title: `Удалить стол «${bench.name}»?` }))) return;
		return run(() => api.delete(`/api/workbenches/${bench.id}`));
	}

	const zoneText = (b: {
		geoLat: number | null;
		geoLng: number | null;
		geoRadiusM: number | null;
	}) =>
		b.geoLat !== null && b.geoLng !== null
			? `зона ${b.geoRadiusM} м вокруг ${b.geoLat.toFixed(5)}, ${b.geoLng.toFixed(5)}`
			: 'без зоны';
</script>

<svelte:head><title>Рабочие столы — Вещи</title></svelte:head>

<p class="mb-3">
	<a
		href="/workbench"
		class="inline-flex min-h-10 items-center text-sm font-medium text-primary-700 hover:underline dark:text-primary-500"
	>
		<ArrowLeftOutline class="me-1 h-4 w-4" />Рабочий стол
	</a>
</p>
<h1 class="mb-3 text-2xl font-bold">Рабочие столы</h1>
<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
	Если у стола есть зона, при «На стол» выберется стол, в зоне которого вы сейчас. Вне зон —
	последний использованный.
</p>

<ul class="flex flex-col gap-3">
	{#each data.workbenches as bench (bench.id)}
		<li>
			<Card class="max-w-none flex-row flex-wrap items-center gap-3 p-4">
				<WorkbenchIcon icon={bench.icon} class="h-6 w-6 text-gray-500 dark:text-gray-400" />
				<div class="min-w-40 flex-1">
					<strong class="font-semibold break-words">{bench.name}</strong>
					<div class="text-sm break-words text-gray-500 dark:text-gray-400">
						{zoneText(bench)}{#if bench.itemCount > 0}&nbsp;· на столе: {bench.itemCount}{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button color="alternative" size="sm" onclick={() => edit(bench)} disabled={busy}>
						Изменить
					</Button>
					<Button
						color="red"
						outline
						size="sm"
						onclick={() => remove(bench)}
						disabled={busy || bench.itemCount > 0}
						title={bench.itemCount > 0 ? 'Сначала уберите вещи со стола' : undefined}
					>
						Удалить
					</Button>
				</div>
			</Card>
		</li>
	{/each}
</ul>

{#if draft}
	<Card class="mt-4 max-w-none p-4">
		<form class="flex flex-col gap-4" onsubmit={save}>
			<h2 class="text-lg font-semibold">{draft.id ? 'Изменить стол' : 'Новый стол'}</h2>
			<Label>
				Название
				<Input class="mt-1" bind:value={draft.name} required maxlength={200} placeholder="Гараж" />
			</Label>
			<fieldset>
				<legend class="mb-2 text-sm font-medium text-gray-900 dark:text-white">Иконка</legend>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
					{#each WORKBENCH_ICONS as option (option.key)}
						{@const selected = draft.icon === option.key}
						<button
							type="button"
							class={[
								'flex h-12 items-center justify-center rounded-lg border focus:ring-4 focus:ring-primary-300 focus:outline-none dark:focus:ring-primary-800',
								selected
									? 'border-primary-700 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/40 dark:text-primary-400'
									: 'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
							]}
							aria-label={option.label}
							aria-pressed={selected}
							title={option.label}
							onclick={() => {
								if (draft) draft.icon = option.key;
							}}
						>
							<WorkbenchIcon icon={option.key} class="h-6 w-6" />
						</button>
					{/each}
				</div>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{workbenchIconLabel(draft.icon)}
				</p>
			</fieldset>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-gray-500 dark:text-gray-400">Зона (необязательно)</span>
				{#if draft.geoLat !== null && draft.geoLng !== null}
					<span class="font-mono text-sm">{draft.geoLat.toFixed(5)}, {draft.geoLng.toFixed(5)}</span
					>
					<Label>
						Радиус, м
						<Input
							class="mt-1"
							type="number"
							min="1"
							step="1"
							bind:value={
								() => draft?.geoRadiusM ?? undefined,
								(v: number | undefined) => {
									if (draft) draft.geoRadiusM = v ?? null;
								}
							}
							required
						/>
					</Label>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button
						type="button"
						color="alternative"
						size="sm"
						onclick={useCurrentPlace}
						disabled={locating}
						loading={locating}
					>
						{#if !locating}<MapPinOutline class="me-1.5 h-4 w-4" />{/if}
						{locating ? 'Определяю…' : 'Взять текущее место'}
					</Button>
					{#if draft.geoLat !== null}
						<Button type="button" color="alternative" size="sm" onclick={clearZone}>
							Убрать зону
						</Button>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy}>Сохранить</Button>
				<Button type="button" color="alternative" onclick={() => (draft = null)} disabled={busy}>
					Отмена
				</Button>
			</div>
		</form>
	</Card>
{:else}
	<p class="mt-4">
		<Button onclick={() => edit()}><PlusOutline class="me-1.5 h-4 w-4" />Добавить стол</Button>
	</p>
{/if}

{#if error}<p class="mt-3 text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
