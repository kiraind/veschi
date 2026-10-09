<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { quantityError } from '$lib/domain/workbench';

	type Contents = 'parent' | 'workbench' | 'discard';

	let {
		item,
		ondone
	}: {
		item: { id: string; name: string; quantity: number; hasChildren: boolean };
		/** Called after a change; without it the page data is reloaded. */
		ondone?: () => void;
	} = $props();

	let open = $state(false);
	let busy = $state(false);
	let error = $state('');
	let useCount = $state(1);
	let contents = $state<Contents>('parent');
	let benches = $state<{ id: string; name: string }[] | null>(null);
	let workbenchId = $state<string | null>(null);

	const useProblem = $derived(quantityError(item.quantity, useCount));

	function start() {
		open = true;
		error = '';
		useCount = 1;
		contents = 'parent';
	}

	async function loadBenches() {
		if (benches) return;
		try {
			const data = await api.get<{
				workbenches: { id: string; name: string }[];
				lastWorkbenchId: string | null;
			}>('/api/workbenches');
			benches = data.workbenches;
			workbenchId =
				benches.find((b) => b.id === data.lastWorkbenchId)?.id ?? benches[0]?.id ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			open = false;
			if (ondone) ondone();
			else await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const use = () => run(() => api.post(`/api/items/${item.id}/consume`, { quantity: useCount }));

	const discard = () =>
		run(() =>
			api.post(`/api/items/${item.id}/discard`, {
				contents,
				workbenchId: contents === 'workbench' ? (workbenchId ?? undefined) : undefined
			})
		);
</script>

{#if !open}
	<button onclick={start}>Использовать / выкинуть</button>
{:else}
	<div class="card stack">
		<strong>{item.name}</strong>

		{#if item.quantity > 1}
			<div class="row">
				<label class="count">
					Использовать (из {item.quantity})
					<input type="number" min="1" max={item.quantity} step="1" bind:value={useCount} />
				</label>
				<button class="primary" onclick={use} disabled={busy || !!useProblem}>Использовать</button>
			</div>
			{#if useProblem}<p class="error">{useProblem}</p>{/if}
			<p class="muted">Если использовать всё, вещь уйдёт в архив.</p>
		{/if}

		{#if item.hasChildren}
			<fieldset class="stack">
				<legend>Что сделать с содержимым?</legend>
				<label class="choice">
					<input type="radio" value="parent" bind:group={contents} />
					Переложить туда, где лежал контейнер
				</label>
				<label class="choice">
					<input type="radio" value="workbench" bind:group={contents} onchange={loadBenches} />
					Переложить на рабочий стол
				</label>
				{#if contents === 'workbench'}
					{#if benches && benches.length === 0}
						<p class="muted">
							Столов пока нет — <a href="/workbench/settings">создать рабочий стол</a>.
						</p>
					{:else if benches}
						<select bind:value={workbenchId} aria-label="Рабочий стол">
							{#each benches as bench (bench.id)}
								<option value={bench.id}>{bench.name}</option>
							{/each}
						</select>
					{/if}
				{/if}
				<label class="choice">
					<input type="radio" value="discard" bind:group={contents} />
					Выкинуть вместе с контейнером
				</label>
			</fieldset>
		{/if}

		<p class="muted">Выкинутая вещь попадёт в архив, её наклейка будет списана.</p>
		<div class="row">
			<button
				class="danger"
				onclick={discard}
				disabled={busy || (contents === 'workbench' && !workbenchId)}
			>
				{item.quantity > 1 ? 'Выкинуть всё' : 'Использовано / выкинуть'}
			</button>
			<button onclick={() => (open = false)} disabled={busy}>Отмена</button>
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
{/if}

<style>
	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		margin: 0;
	}
	.choice {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		color: var(--text);
		font-size: 1rem;
	}
	.count {
		flex: 1;
		min-width: 10rem;
	}
</style>
