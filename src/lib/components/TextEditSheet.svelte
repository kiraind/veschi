<script lang="ts">
	import { Button, Input, Label, Textarea } from 'flowbite-svelte';
	import { ApiError } from '$lib/api';
	import Sheet from './Sheet.svelte';

	/**
	 * A sheet with one text field and «Сохранить»: the «pen → sheet» way to edit
	 * a name or a description in place. `onsave` gets the trimmed text.
	 */
	let {
		open = $bindable(false),
		title,
		label,
		value,
		placeholder = '',
		multiline = false,
		required = false,
		helper = '',
		onsave
	}: {
		open?: boolean;
		title: string;
		label: string;
		value: string;
		placeholder?: string;
		multiline?: boolean;
		required?: boolean;
		helper?: string;
		onsave: (text: string) => Promise<void>;
	} = $props();

	const id = $props.id();
	let text = $state('');
	let busy = $state(false);
	let error = $state('');

	// Each opening starts from the saved value.
	$effect(() => {
		if (open) {
			text = value;
			error = '';
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await onsave(text.trim());
			open = false;
		} catch (e) {
			error = e instanceof ApiError ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open {title}>
	<form class="flex flex-col gap-3" onsubmit={save}>
		<div>
			<Label for="text-{id}">{label}</Label>
			{#if multiline}
				<Textarea id="text-{id}" class="mt-1" bind:value={text} rows={5} {placeholder} />
			{:else}
				<Input id="text-{id}" class="mt-1" bind:value={text} {placeholder} {required} />
			{/if}
			{#if helper}<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{helper}</p>{/if}
		</div>
		{#if error}<p class="text-sm text-red-600 dark:text-red-500" role="alert">{error}</p>{/if}
		<div class="flex flex-wrap gap-2">
			<Button type="submit" disabled={busy || (required && !text.trim())} loading={busy}
				>Сохранить</Button
			>
			<Button color="alternative" onclick={() => (open = false)} disabled={busy}>Отмена</Button>
		</div>
	</form>
</Sheet>
