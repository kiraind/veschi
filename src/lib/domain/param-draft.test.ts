import { describe, expect, it } from 'vitest';
import {
	draftFromView,
	draftToInput,
	emptyDraft,
	isEmptyDraft,
	parseNumberInput
} from './param-draft';
import { paramInputSchema, type ParamView } from './params';

const DEF = 'ctest00000000000000000d1';

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
				valueType: 'ITEM',
				refIds: ['ctest0000000000000000003', 'ctest0000000000000000004'],
				refs: [
					{ id: 'ctest0000000000000000003', name: 'БП', archived: false },
					{ id: 'ctest0000000000000000004', name: 'Кабель', archived: true }
				]
			},
			{
				id: '4',
				defId: DEF,
				key: 'подходит к',
				valueType: 'TYPE',
				refIds: ['ctest0000000000000000005'],
				refs: [{ id: 'ctest0000000000000000005', name: 'Ноутбук', archived: false }]
			}
		];
		for (const view of views) {
			const { id: _id, key: _key, refs: _refs, unit: _unit, ...input } = view;
			expect(paramInputSchema.parse(draftToInput(draftFromView(view)))).toEqual(input);
		}
	});

	it('turns a typed number into a value', () => {
		const d = emptyDraft({ id: DEF, name: 'цена', valueType: 'NUMBER', unit: '₽' });
		d.number = '4 500';
		expect(d.unit).toBe('₽');
		expect(paramInputSchema.parse(draftToInput(d))).toEqual({
			defId: DEF,
			valueType: 'NUMBER',
			value: 4500
		});
	});

	it('leaves an empty number invalid', () => {
		const d = emptyDraft({ id: DEF, name: 'вес', valueType: 'NUMBER' });
		expect(paramInputSchema.safeParse(draftToInput(d)).success).toBe(false);
	});
});

describe('isEmptyDraft', () => {
	it('tells untouched values from typed ones', () => {
		const text = emptyDraft({ id: DEF, name: 'цвет', valueType: 'STRING' });
		expect(isEmptyDraft(text)).toBe(true);
		text.text = '  ';
		expect(isEmptyDraft(text)).toBe(true);
		text.text = 'красный';
		expect(isEmptyDraft(text)).toBe(false);
		const range = emptyDraft({ id: DEF, name: 'питание', valueType: 'RANGE' });
		range.max = '16';
		expect(isEmptyDraft(range)).toBe(false);
		expect(isEmptyDraft(emptyDraft({ id: DEF, name: 'работает', valueType: 'BOOLEAN' }))).toBe(
			false
		);
		expect(isEmptyDraft(emptyDraft({ id: DEF, name: 'зарядка', valueType: 'ITEM' }))).toBe(true);
	});
});
