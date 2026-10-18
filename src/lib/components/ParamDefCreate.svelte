<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { api, errorText } from '$lib/api';
	import type { LinkKind, ParamDefView, ParamValueType } from '$lib/domain/params';
	import ParamDefFields from './ParamDefFields.svelte';

	/**
	 * Form for a new parameter: name, value type, unit, drop-down options or,
	 * for a link, where it lives and its inverse's name.
	 */
	let {
		name: initialName = '',
		holder: fixedHolder,
		oncreated,
		oncancel,
		cancelLabel = 'Отмена'
	}: {
		name?: string;
		/** A link made here lives on these (the page adds a value to an item or a type). */
		holder?: LinkKind;
		oncreated: (def: ParamDefView) => void;
		oncancel: () => void;
		cancelLabel?: string;
	} = $props();

	// The form starts from the typed name and is edited on its own afterwards.
	// svelte-ignore state_referenced_locally
	let name = $state(initialName.trim());
	let valueType = $state<ParamValueType>('STRING');
	let unit = $state('');
	let fileNameTemplate = $state('');
	let multiple = $state(false);
	let options = $state<{ label: string }[]>([]);
	// svelte-ignore state_referenced_locally
	let holder = $state<LinkKind>(fixedHolder ?? 'ITEM');
	let inverseName = $state('');
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
					fileNameTemplate,
					multiple,
					// An empty option left at the end (Enter adds one) is not an option.
					options: options.filter((o) => o.label.trim()),
					holder,
					inverseName
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
	<ParamDefFields
		bind:name
		bind:valueType
		bind:unit
		bind:fileNameTemplate
		bind:multiple
		bind:options
		bind:holder
		bind:inverseName
		holderLocked={fixedHolder !== undefined}
	/>
	{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button type="submit" disabled={busy || (valueType === 'ENUM' && options.length === 0)}>
			Создать
		</Button>
		<Button type="button" color="alternative" onclick={oncancel}>{cancelLabel}</Button>
	</div>
</form>
