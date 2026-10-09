/**
 * Editable form state of one parameter (ParamEditor). Every value type keeps
 * its own fields, so switching the type back and forth loses nothing; numbers
 * stay strings until saving so «4,5» can be typed.
 */
import type { ParamInput, ParamValueType, ParamView } from './params';

export interface ParamDraft {
	uid: number;
	key: string;
	valueType: ParamValueType;
	text: string;
	number: string;
	min: string;
	max: string;
	unit: string;
	dictionaryId: string;
	optionIds: string[];
	url: string;
	file: { fileKey: string; fileName: string; fileMime: string; fileSize: number } | null;
	date: string;
	ref: { kind: 'item' | 'type'; id: string; name: string } | null;
	bool: boolean;
}

let nextUid = 1;

export function emptyDraft(valueType: ParamValueType = 'STRING'): ParamDraft {
	return {
		uid: nextUid++,
		key: '',
		valueType,
		text: '',
		number: '',
		min: '',
		max: '',
		unit: '',
		dictionaryId: '',
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
	const d = emptyDraft(p.valueType);
	d.key = p.key;
	switch (p.valueType) {
		case 'STRING':
			d.text = p.text;
			break;
		case 'NUMBER':
			d.number = numberText(p.value);
			d.unit = p.unit ?? '';
			break;
		case 'RANGE':
			d.min = numberText(p.min);
			d.max = numberText(p.max);
			d.unit = p.unit ?? '';
			break;
		case 'ENUM':
			d.dictionaryId = p.dictionaryId;
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
	const key = d.key;
	switch (d.valueType) {
		case 'STRING':
			return { key, valueType: 'STRING', text: d.text };
		case 'NUMBER':
			return { key, valueType: 'NUMBER', value: parseNumberInput(d.number), unit: d.unit };
		case 'RANGE':
			return {
				key,
				valueType: 'RANGE',
				min: parseNumberInput(d.min),
				max: parseNumberInput(d.max),
				unit: d.unit
			};
		case 'ENUM':
			return { key, valueType: 'ENUM', dictionaryId: d.dictionaryId, optionIds: d.optionIds };
		case 'URL':
			return { key, valueType: 'URL', url: d.url };
		case 'FILE':
			return { key, valueType: 'FILE', ...d.file };
		case 'DATE':
			return { key, valueType: 'DATE', date: d.date };
		case 'REF':
			return {
				key,
				valueType: 'REF',
				refItemId: d.ref?.kind === 'item' ? d.ref.id : null,
				refTypeId: d.ref?.kind === 'type' ? d.ref.id : null
			};
		case 'BOOLEAN':
			return { key, valueType: 'BOOLEAN', value: d.bool };
	}
}
