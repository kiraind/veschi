<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Card, Input, Label, Radio, Select } from 'flowbite-svelte';
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

	const radioLabel = 'min-h-10 cursor-pointer text-base font-normal text-gray-900 dark:text-white';

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
	<Button color="alternative" onclick={start}>Использовать / выкинуть</Button>
{:else}
	<Card class="max-w-none gap-3 p-4">
		<strong class="wrap-anywhere">{item.name}</strong>

		{#if item.quantity > 1}
			<div class="flex flex-wrap items-end gap-2">
				<Label class="min-w-40 flex-1">
					Использовать (из {item.quantity})
					<Input
						class="mt-1"
						type="number"
						min="1"
						max={item.quantity}
						step="1"
						bind:value={useCount}
					/>
				</Label>
				<Button onclick={use} disabled={busy || !!useProblem}>Использовать</Button>
			</div>
			{#if useProblem}<p class="text-sm text-red-600 dark:text-red-500">{useProblem}</p>{/if}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Если использовать всё, вещь уйдёт в архив.
			</p>
		{/if}

		{#if item.hasChildren}
			<fieldset
				class="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
			>
				<legend class="px-1 text-sm font-medium text-gray-700 dark:text-gray-200">
					Что сделать с содержимым?
				</legend>
				<Radio value="parent" bind:group={contents} classes={{ label: radioLabel }}>
					Переложить туда, где лежал контейнер
				</Radio>
				<Radio
					value="workbench"
					bind:group={contents}
					onchange={loadBenches}
					classes={{ label: radioLabel }}
				>
					Переложить на рабочий стол
				</Radio>
				{#if contents === 'workbench'}
					{#if benches && benches.length === 0}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Столов пока нет — <a href="/workbench/settings">создать рабочий стол</a>.
						</p>
					{:else if benches}
						<Select bind:value={workbenchId} placeholder="" aria-label="Рабочий стол">
							{#each benches as bench (bench.id)}
								<option value={bench.id}>{bench.name}</option>
							{/each}
						</Select>
					{/if}
				{/if}
				<Radio value="discard" bind:group={contents} classes={{ label: radioLabel }}>
					Выкинуть вместе с контейнером
				</Radio>
			</fieldset>
		{/if}

		<p class="text-sm text-gray-500 dark:text-gray-400">
			Выкинутая вещь попадёт в архив, её наклейка будет списана.
		</p>
		<div class="flex flex-wrap gap-2">
			<Button
				color="red"
				outline
				onclick={discard}
				disabled={busy || (contents === 'workbench' && !workbenchId)}
			>
				{item.quantity > 1 ? 'Выкинуть всё' : 'Использовано / выкинуть'}
			</Button>
			<Button color="alternative" onclick={() => (open = false)} disabled={busy}>Отмена</Button>
		</div>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	</Card>
{/if}
