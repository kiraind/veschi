<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import OptionListEditor from '$lib/components/OptionListEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let name = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	let busy = $state(false);
	let error = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await api.post('/api/dictionaries', { name, multiple, options });
			name = '';
			multiple = false;
			options = [];
			creating = false;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Справочники — Вещи</title></svelte:head>

<h1>Справочники</h1>
<p class="muted">
	Списки вариантов для параметров «из справочника»: например, «Состояние» — новое / б/у / сломано.
	Один справочник используется в параметрах любых типов и вещей.
</p>

<ul class="list">
	{#each data.dictionaries as d (d.id)}
		<li class="card">
			<a href="/dictionaries/{d.id}"><strong>{d.name}</strong></a>
			<span class="muted">{d.multiple ? 'несколько вариантов' : 'один вариант'}</span>
			<div class="muted">{d.options.map((o) => o.label).join(' / ') || 'нет вариантов'}</div>
		</li>
	{:else}
		<li class="muted">Справочников пока нет.</li>
	{/each}
</ul>

{#if creating}
	<form class="card stack create" onsubmit={create}>
		<label>
			Название
			<input bind:value={name} placeholder="Например, Состояние" required />
		</label>
		<label class="check">
			<input type="checkbox" bind:checked={multiple} />
			Можно выбрать несколько вариантов
		</label>
		<span class="muted">Варианты</span>
		<OptionListEditor bind:options />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="row">
			<button class="primary" type="submit" disabled={busy}>Создать</button>
			<button type="button" onclick={() => (creating = false)}>Отмена</button>
		</div>
	</form>
{:else}
	<button class="create" onclick={() => (creating = true)}>+ Новый справочник</button>
{/if}

<style>
	.create {
		margin-top: 1rem;
	}
	.check {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		color: var(--text);
	}
</style>
