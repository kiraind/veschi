/**
 * Editable form state of one parameter value (ParamSection). The definition
 * fixes the name, the value type, the unit and the drop-down options; numbers
 * stay strings until saving so «4,5» can be typed.
 */
import type { ParamInput, ParamValueType, ParamView } from './params';

/** What a draft needs to know about its parameter definition. */
export interface DraftDef {
	id: string;
	name: string;
	valueType: ParamValueType;
	/** NUMBER, RANGE: shown next to the number, not edited here. */
	unit?: string | null;
}

export interface ParamDraft {
	uid: number;
	defId: string;
	/** The definition's name, for display. */
	key: string;
	valueType: ParamValueType;
	text: string;
	number: string;
	min: string;
	max: string;
	/** The definition's unit (display only). */
	unit: string;
	optionIds: string[];
	url: string;
	file: { fileKey: string; fileName: string; fileMime: string; fileSize: number } | null;
	date: string;
	ref: { kind: 'item' | 'type'; id: string; name: string } | null;
	bool: boolean;
}

let nextUid = 1;

export function emptyDraft(def: DraftDef): ParamDraft {
	return {
		uid: nextUid++,
		defId: def.id,
		key: def.name,
		valueType: def.valueType,
		text: '',
		number: '',
		min: '',
		max: '',
		unit: def.unit ?? '',
		optionIds: [],
		url: '',
		file: null,
		date: '',
		ref: null,
		bool: false
	};
}

/** Number typed with a comma or a dot, any spaces allowed («4 500,5»); NaN when empty or invalid. */
export function parseNumberInput(s: string): number {
	const cleaned = s.replace(/\s/g, '').replace(',', '.');
	return cleaned === '' ? NaN : Number(cleaned);
}

function numberText(n: number): string {
	return String(n).replace('.', ',');
}

export function draftFromView(p: ParamView): ParamDraft {
	const d = emptyDraft({
		id: p.defId,
		name: p.key,
		valueType: p.valueType,
		unit: p.unit ?? null
	});
	switch (p.valueType) {
		case 'STRING':
			d.text = p.text;
			break;
		case 'NUMBER':
			d.number = numberText(p.value);
			break;
		case 'RANGE':
			d.min = numberText(p.min);
			d.max = numberText(p.max);
			break;
		case 'ENUM':
			d.optionIds = [...p.optionIds];
			break;
		case 'URL':
			d.url = p.url;
			break;
		case 'FILE':
			d.file = {
				fileKey: p.fileKey,
				fileName: p.fileName,
				fileMime: p.fileMime,
				fileSize: p.fileSize
			};
			break;
		case 'DATE':
			d.date = p.date;
			break;
		case 'REF':
			d.ref = p.ref ? { kind: p.ref.kind, id: p.ref.id, name: p.ref.name } : null;
			break;
		case 'BOOLEAN':
			d.bool = p.value;
			break;
	}
	return d;
}

/** The raw input for `paramInputSchema` (validation happens there). */
export function draftToInput(d: ParamDraft): Partial<ParamInput> & Record<string, unknown> {
	const base = { defId: d.defId };
	switch (d.valueType) {
		case 'STRING':
			return { ...base, valueType: 'STRING', text: d.text };
		case 'NUMBER':
			return { ...base, valueType: 'NUMBER', value: parseNumberInput(d.number) };
		case 'RANGE':
			return {
				...base,
				valueType: 'RANGE',
				min: parseNumberInput(d.min),
				max: parseNumberInput(d.max)
			};
		case 'ENUM':
			return { ...base, valueType: 'ENUM', optionIds: d.optionIds };
		case 'URL':
			return { ...base, valueType: 'URL', url: d.url };
		case 'FILE':
			return { ...base, valueType: 'FILE', ...d.file };
		case 'DATE':
			return { ...base, valueType: 'DATE', date: d.date };
		case 'REF':
			return {
				...base,
				valueType: 'REF',
				refItemId: d.ref?.kind === 'item' ? d.ref.id : null,
				refTypeId: d.ref?.kind === 'type' ? d.ref.id : null
			};
		case 'BOOLEAN':
			return { ...base, valueType: 'BOOLEAN', value: d.bool };
	}
}
