<script lang="ts">
	import RequiredMark from './RequiredMark.svelte';
	import { Checkbox, Input, Label, Select } from 'flowbite-svelte';
	import {
		LINK_HOLDER_LABELS,
		PARAM_VALUE_TYPES,
		PARAM_VALUE_TYPE_LABELS,
		hasUnit,
		inverseNameLabel,
		isLink,
		type LinkKind,
		type ParamValueType
	} from '$lib/domain/params';
	import InfoHint from './InfoHint.svelte';
	import OptionListEditor from './OptionListEditor.svelte';

	/**
	 * Fields of a parameter: name, value type, unit (numbers), for a drop-down
	 * its options, for a link («Вещь», «Тип») where it lives and the name of
	 * its inverse. Used when creating a parameter and on its page.
	 */
	let {
		name = $bindable(),
		valueType = $bindable(),
		unit = $bindable(),
		multiple = $bindable(),
		options = $bindable(),
		holder = $bindable(),
		inverseName = $bindable(),
		typeLocked = false,
		holderLocked = false,
		noLinks = false
	}: {
		name: string;
		valueType: ParamValueType;
		unit: string;
		multiple: boolean;
		options: { id?: string; label: string; usage?: number }[];
		/** Links: on items or on types. */
		holder: LinkKind;
		/** Links: the name of the inverse (the same name — a symmetric link). */
		inverseName: string;
		/** The value type cannot change (the parameter has values, or it is a link). */
		typeLocked?: boolean;
		/** Where a link lives cannot change (set by the page it is created on, or fixed). */
		holderLocked?: boolean;
		/** «Вещь» and «Тип» are not offered (an existing parameter cannot become a link). */
		noLinks?: boolean;
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
			{#if !noLinks || !isLink(type)}
				<option value={type}>{PARAM_VALUE_TYPE_LABELS[type]}</option>
			{/if}
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
{:else if isLink(valueType)}
	<Label>
		Где задаётся<RequiredMark />
		<Select class="mt-1" bind:value={holder} placeholder="" disabled={holderLocked}>
			{#each ['ITEM', 'TYPE'] as const as kind (kind)}
				<option value={kind}>{LINK_HOLDER_LABELS[kind].replace(/^у/, 'У')}</option>
			{/each}
		</Select>
	</Label>
	<Label>
		<span
			>{inverseNameLabel(valueType)}<RequiredMark /><InfoHint title={inverseNameLabel(valueType)}>
				<p>
					Такой параметр сам появится у {valueType === 'TYPE' ? 'типа, который' : 'вещи, которую'} выберут
					в значении. Например, у радио заполнили «Содержит деталь» → лампа, и у лампы появилась «Является
					деталью» → радио.
				</p>
				<p>
					Если связь одинаковая в обе стороны, как «Совместим с», напишите то же название, что и
					сверху.
				</p>
			</InfoHint></span
		>
		<Input class="mt-1" bind:value={inverseName} placeholder="Например, Является деталью" />
	</Label>
{/if}
