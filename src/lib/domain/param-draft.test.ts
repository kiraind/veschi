import { describe, expect, it } from 'vitest';
import { draftFromView, draftToInput, emptyDraft, parseNumberInput } from './param-draft';
import { paramInputSchema, type ParamView } from './params';

const DEF = '00000000-0000-4000-8000-0000000000d1';

describe('parseNumberInput', () => {
	it('accepts commas, dots and spaces', () => {
		expect(parseNumberInput('4,5')).toBe(4.5);
		expect(parseNumberInput('4 500')).toBe(4500);
		expect(parseNumberInput('16')).toBe(16);
		expect(parseNumberInput('')).toBeNaN();
		expect(parseNumberInput('abc')).toBeNaN();
	});
});

describe('drafts', () => {
	it('round-trips stored values', () => {
		const views: ParamView[] = [
			{ id: '1', defId: DEF, key: 'питание', valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{ id: '2', defId: DEF, key: 'работает', valueType: 'BOOLEAN', value: false },
			{
				id: '3',
				defId: DEF,
				key: 'зарядка',
				valueType: 'REF',
				refItemId: '00000000-0000-4000-8000-000000000003',
				refTypeId: null,
				ref: {
					kind: 'item',
					id: '00000000-0000-4000-8000-000000000003',
					name: 'БП',
					archived: false
				}
			}
		];
		for (const view of views) {
			const { id: _id, key: _key, ref: _ref, ...input } = view;
			expect(paramInputSchema.parse(draftToInput(draftFromView(view)))).toEqual(input);
		}
	});

	it('turns a typed number into a value', () => {
		const d = emptyDraft({ id: DEF, name: 'цена', valueType: 'NUMBER', dictionaryId: null });
		d.number = '4 500';
		d.unit = '₽';
		expect(paramInputSchema.parse(draftToInput(d))).toEqual({
			defId: DEF,
			valueType: 'NUMBER',
			value: 4500,
			unit: '₽'
		});
	});

	it('leaves an empty number invalid', () => {
		const d = emptyDraft({ id: DEF, name: 'вес', valueType: 'NUMBER', dictionaryId: null });
		expect(paramInputSchema.safeParse(draftToInput(d)).success).toBe(false);
	});
});
