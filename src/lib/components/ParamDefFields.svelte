<script lang="ts">
	import RequiredMark from './RequiredMark.svelte';
	import { Checkbox, Input, Label, Select } from 'flowbite-svelte';
	import {
		PARAM_VALUE_TYPES,
		PARAM_VALUE_TYPE_LABELS,
		hasUnit,
		type ParamValueType
	} from '$lib/domain/params';
	import OptionListEditor from './OptionListEditor.svelte';

	/**
	 * Fields of a parameter: name, value type, unit (numbers) and, for a
	 * drop-down, its options. Used when creating a parameter and on its page.
	 */
	let {
		name = $bindable(),
		valueType = $bindable(),
		unit = $bindable(),
		multiple = $bindable(),
		options = $bindable(),
		typeLocked = false
	}: {
		name: string;
		valueType: ParamValueType;
		unit: string;
		multiple: boolean;
		options: { id?: string; label: string; usage?: number }[];
		/** The value type cannot change (the parameter has values). */
		typeLocked?: boolean;
	} = $props();
</script>

<Label>
	Название<RequiredMark />
	<Input class="mt-1" bind:value={name} required />
</Label>
<Label>
	Тип значения<RequiredMark />
	<Select class="mt-1" bind:value={valueType} placeholder="" disabled={typeLocked}>
		{#each PARAM_VALUE_TYPES as type (type)}
			<option value={type}>{PARAM_VALUE_TYPE_LABELS[type]}</option>
		{/each}
	</Select>
</Label>
{#if hasUnit(valueType)}
	<Label>
		Единица измерения
		<Input class="mt-1" bind:value={unit} placeholder="Например, мм или В" />
	</Label>
{:else if valueType === 'ENUM'}
	<span class="text-sm font-medium text-gray-900 dark:text-white">Варианты</span>
	<OptionListEditor bind:options />
	<Checkbox bind:checked={multiple}>Можно выбрать несколько вариантов</Checkbox>
{/if}
