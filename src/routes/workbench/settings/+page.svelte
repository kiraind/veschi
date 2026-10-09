<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Draft {
		/** null = a new bench. */
		id: string | null;
		name: string;
		geoLat: number | null;
		geoLng: number | null;
		geoRadiusM: number | null;
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
					geoRadiusM: bench.geoRadiusM
				}
			: { id: null, name: '', geoLat: null, geoLng: null, geoRadiusM: null };
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

	function remove(bench: { id: string; name: string }) {
		if (!confirm(`Удалить стол «${bench.name}»?`)) return;
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

<p><a href="/workbench">← Рабочий стол</a></p>
<h1>Рабочие столы</h1>
<p class="muted">
	Если у стола есть зона, при «На стол» выберется стол, в зоне которого вы сейчас. Вне зон —
	последний использованный.
</p>

<ul class="list">
	{#each data.workbenches as bench (bench.id)}
		<li class="card row bench">
			<div class="grow">
				<strong>{bench.name}</strong>
				<div class="muted">
					{zoneText(bench)}{#if bench.itemCount > 0}&nbsp;· на столе: {bench.itemCount}{/if}
				</div>
			</div>
			<button onclick={() => edit(bench)} disabled={busy}>Изменить</button>
			<button
				class="danger"
				onclick={() => remove(bench)}
				disabled={busy || bench.itemCount > 0}
				title={bench.itemCount > 0 ? 'Сначала уберите вещи со стола' : undefined}
			>
				Удалить
			</button>
		</li>
	{/each}
</ul>

{#if draft}
	<form class="card stack form" onsubmit={save}>
		<h2>{draft.id ? 'Изменить стол' : 'Новый стол'}</h2>
		<label>
			Название
			<input bind:value={draft.name} required maxlength="200" placeholder="Гараж" />
		</label>
		<div class="stack">
			<span class="muted">Зона (необязательно)</span>
			{#if draft.geoLat !== null && draft.geoLng !== null}
				<span class="mono">{draft.geoLat.toFixed(5)}, {draft.geoLng.toFixed(5)}</span>
				<label>
					Радиус, м
					<input type="number" min="1" step="1" bind:value={draft.geoRadiusM} required />
				</label>
			{/if}
			<div class="row">
				<button type="button" onclick={useCurrentPlace} disabled={locating}>
					{locating ? 'Определяю…' : 'Взять текущее место'}
				</button>
				{#if draft.geoLat !== null}
					<button type="button" onclick={clearZone}>Убрать зону</button>
				{/if}
			</div>
		</div>
		<div class="row">
			<button class="primary" type="submit" disabled={busy}>Сохранить</button>
			<button type="button" onclick={() => (draft = null)} disabled={busy}>Отмена</button>
		</div>
	</form>
{:else}
	<p><button class="primary" onclick={() => edit()}>Добавить стол</button></p>
{/if}

{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
	.grow {
		flex: 1;
		min-width: 10rem;
	}
	.form {
		margin-top: var(--gap);
	}
	.form h2 {
		margin: 0;
	}
</style>
