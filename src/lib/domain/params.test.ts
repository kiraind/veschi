import { describe, expect, it } from 'vitest';
import {
	formatDate,
	formatFileSize,
	formatNumber,
	formatParamValue,
	mergeParams,
	paramDefInputSchema,
	paramInputSchema,
	paramListSchema
} from './params';

const NNBSP = '\u202f';

const DEF = '00000000-0000-4000-8000-0000000000d1';

describe('paramInputSchema', () => {
	it('accepts every value type', () => {
		const inputs = [
			{ defId: DEF, valueType: 'STRING', text: 'DIP-8' },
			{ defId: DEF, valueType: 'NUMBER', value: 85, unit: 'мм' },
			{ defId: DEF, valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{
				defId: DEF,
				valueType: 'ENUM',
				optionIds: ['00000000-0000-4000-8000-000000000002']
			},
			{ defId: DEF, valueType: 'URL', url: 'https://example.com/ne555.pdf' },
			{
				defId: DEF,
				valueType: 'FILE',
				fileKey: 'params/u/f',
				fileName: 'manual.pdf',
				fileMime: 'application/pdf',
				fileSize: 1000
			},
			{ defId: DEF, valueType: 'DATE', date: '2027-05-01' },
			{ defId: DEF, valueType: 'REF', refItemId: '00000000-0000-4000-8000-000000000003' },
			{ defId: DEF, valueType: 'BOOLEAN', value: false }
		];
		for (const input of inputs) expect(paramInputSchema.parse(input)).toMatchObject(input);
	});

	it('rejects a range with min > max', () => {
		const r = paramInputSchema.safeParse({ defId: DEF, valueType: 'RANGE', min: 16, max: 4.5 });
		expect(r.success).toBe(false);
		expect(r.error?.issues[0]?.message).toBe('Минимум больше максимума');
	});

	it('rejects invalid dates, urls and refs', () => {
		expect(
			paramInputSchema.safeParse({ defId: DEF, valueType: 'DATE', date: '2027-02-30' }).success
		).toBe(false);
		expect(
			paramInputSchema.safeParse({ defId: DEF, valueType: 'URL', url: 'javascript:alert(1)' })
				.success
		).toBe(false);
		expect(paramInputSchema.safeParse({ defId: DEF, valueType: 'REF' }).success).toBe(false);
	});

	it('empties the unit', () => {
		expect(paramInputSchema.parse({ defId: DEF, valueType: 'NUMBER', value: 3, unit: '' })).toEqual(
			{ defId: DEF, valueType: 'NUMBER', value: 3, unit: null }
		);
	});

	it('rejects the same parameter twice in one list', () => {
		const r = paramListSchema.safeParse([
			{ defId: DEF, valueType: 'STRING', text: 'красный' },
			{ defId: DEF, valueType: 'STRING', text: 'синий' }
		]);
		expect(r.success).toBe(false);
	});
});

describe('paramDefInputSchema', () => {
	it('trims the name and needs a list for ENUM', () => {
		expect(paramDefInputSchema.parse({ name: ' вес ', valueType: 'NUMBER' })).toEqual({
			name: 'вес',
			valueType: 'NUMBER',
			dictionaryId: null
		});
		expect(paramDefInputSchema.safeParse({ name: 'цвет', valueType: 'ENUM' }).success).toBe(false);
		expect(
			paramDefInputSchema.parse({ name: 'вес', valueType: 'NUMBER', dictionaryId: DEF })
				.dictionaryId
		).toBeNull();
	});
});

describe('formatting', () => {
	it('formats numbers the Russian way', () => {
		expect(formatNumber(85)).toBe('85');
		expect(formatNumber(4.5)).toBe('4,5');
		expect(formatNumber(4500)).toBe(`4${NNBSP}500`);
		expect(formatNumber(1234567.25)).toBe(`1${NNBSP}234${NNBSP}567,25`);
		expect(formatNumber(0.1 + 0.2)).toBe('0,3');
		expect(formatNumber(-2)).toBe('−2');
	});

	it('formats each value type', () => {
		const f = formatParamValue;
		expect(f({ valueType: 'NUMBER', value: 85, unit: 'мм' })).toBe('85 мм');
		expect(f({ valueType: 'NUMBER', value: 4500, unit: '₽' })).toBe(`4${NNBSP}500 ₽`);
		expect(f({ valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' })).toBe('4,5–16 В');
		expect(f({ valueType: 'BOOLEAN', value: true })).toBe('да');
		expect(f({ valueType: 'BOOLEAN', value: false })).toBe('нет');
		expect(f({ valueType: 'DATE', date: '2027-05-01' })).toBe('2027-05-01');
		expect(
			f({
				valueType: 'ENUM',
				optionIds: ['a', 'b'],
				options: [
					{ id: 'a', label: 'USB' },
					{ id: 'b', label: 'Bluetooth' }
				]
			})
		).toBe('USB, Bluetooth');
		expect(
			f({
				valueType: 'REF',
				refItemId: 'x',
				refTypeId: null,
				ref: { kind: 'item', id: 'x', name: 'Блок питания 12 В', archived: true }
			})
		).toBe('Блок питания 12 В');
	});

	it('formats dates and sizes', () => {
		expect(formatDate('2026-12-31')).toBe('2026-12-31');
		expect(formatFileSize(500)).toBe('500 Б');
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 МБ');
	});
});

describe('mergeParams', () => {
	it('lets an item value override the type value of the same parameter', () => {
		const merged = mergeParams(
			[
				{ defId: 'color', v: 'красный' },
				{ defId: 'weight', v: '10 г' }
			],
			[
				{ defId: 'color', v: 'синий' },
				{ defId: 'serial', v: 'A1' }
			]
		);
		expect(merged).toEqual([
			{ defId: 'color', v: 'синий', source: 'item' },
			{ defId: 'weight', v: '10 г', source: 'type' },
			{ defId: 'serial', v: 'A1', source: 'item' }
		]);
	});
});
