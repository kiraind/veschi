<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import type { ParamDefView, ParamValueType } from '$lib/domain/params';
	import ParamDefFields from './ParamDefFields.svelte';

	/** Form for a new parameter: name, value type, unit or drop-down options. */
	let {
		name: initialName = '',
		oncreated,
		oncancel,
		cancelLabel = 'Отмена'
	}: {
		name?: string;
		oncreated: (def: ParamDefView) => void;
		oncancel: () => void;
		cancelLabel?: string;
	} = $props();

	// The form starts from the typed name and is edited on its own afterwards.
	// svelte-ignore state_referenced_locally
	let name = $state(initialName.trim());
	let valueType = $state<ParamValueType>('STRING');
	let unit = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	let busy = $state(false);
	let error = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			oncreated(
				await api.post<ParamDefView>('/api/param-defs', {
					name,
					valueType,
					unit,
					multiple,
					// An empty option left at the end (Enter adds one) is not an option.
					options: options.filter((o) => o.label.trim())
				})
			);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-3" onsubmit={create}>
	<ParamDefFields bind:name bind:valueType bind:unit bind:multiple bind:options />
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy || (valueType === 'ENUM' && options.length === 0)}>
			Создать
		</Button>
		<Button type="button" color="alternative" onclick={oncancel}>{cancelLabel}</Button>
	</div>
</form>
