import { describe, expect, it } from 'vitest';
import {
	formatDate,
	formatFileSize,
	formatNumber,
	formatParamValue,
	mergeParams,
	paramInputSchema,
	paramListSchema
} from './params';

const NNBSP = '\u202f';

describe('paramInputSchema', () => {
	it('accepts every value type', () => {
		const inputs = [
			{ key: 'корпус', valueType: 'STRING', text: 'DIP-8' },
			{ key: 'длина', valueType: 'NUMBER', value: 85, unit: 'мм' },
			{ key: 'питание', valueType: 'RANGE', min: 4.5, max: 16, unit: 'В' },
			{
				key: 'состояние',
				valueType: 'ENUM',
				dictionaryId: '00000000-0000-4000-8000-000000000001',
				optionIds: ['00000000-0000-4000-8000-000000000002']
			},
			{ key: 'даташит', valueType: 'URL', url: 'https://example.com/ne555.pdf' },
			{
				key: 'инструкция',
				valueType: 'FILE',
				fileKey: 'params/u/f',
				fileName: 'manual.pdf',
				fileMime: 'application/pdf',
				fileSize: 1000
			},
			{ key: 'гарантия до', valueType: 'DATE', date: '2027-05-01' },
			{ key: 'зарядка', valueType: 'REF', refItemId: '00000000-0000-4000-8000-000000000003' },
			{ key: 'работает', valueType: 'BOOLEAN', value: false }
		];
		for (const input of inputs) expect(paramInputSchema.parse(input)).toMatchObject(input);
	});

	it('rejects a range with min > max', () => {
		const r = paramInputSchema.safeParse({ key: 'питание', valueType: 'RANGE', min: 16, max: 4.5 });
		expect(r.success).toBe(false);
		expect(r.error?.issues[0]?.message).toBe('Минимум больше максимума');
	});

	it('rejects invalid dates, urls and refs', () => {
		expect(
			paramInputSchema.safeParse({ key: 'd', valueType: 'DATE', date: '2027-02-30' }).success
		).toBe(false);
		expect(
			paramInputSchema.safeParse({ key: 'u', valueType: 'URL', url: 'javascript:alert(1)' }).success
		).toBe(false);
		expect(paramInputSchema.safeParse({ key: 'r', valueType: 'REF' }).success).toBe(false);
	});

	it('trims keys and empties the unit', () => {
		expect(
			paramInputSchema.parse({ key: ' вес ', valueType: 'NUMBER', value: 3, unit: '' })
		).toEqual({
			key: 'вес',
			valueType: 'NUMBER',
			value: 3,
			unit: null
		});
	});

	it('rejects duplicate keys in one list, case-insensitively', () => {
		const r = paramListSchema.safeParse([
			{ key: 'Цвет', valueType: 'STRING', text: 'красный' },
			{ key: 'цвет', valueType: 'STRING', text: 'синий' }
		]);
		expect(r.success).toBe(false);
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
		expect(f({ valueType: 'DATE', date: '2027-05-01' })).toBe('1 мая 2027');
		expect(
			f({
				valueType: 'ENUM',
				dictionaryId: 'd',
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
		expect(formatDate('2026-12-31')).toBe('31 декабря 2026');
		expect(formatFileSize(500)).toBe('500 Б');
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 МБ');
	});
});

describe('mergeParams', () => {
	it('lets an item value override the type value with the same key', () => {
		const merged = mergeParams(
			[
				{ key: 'Цвет', v: 'красный' },
				{ key: 'вес', v: '10 г' }
			],
			[
				{ key: 'цвет ', v: 'синий' },
				{ key: 'серийный номер', v: 'A1' }
			]
		);
		expect(merged).toEqual([
			{ key: 'цвет ', v: 'синий', source: 'item' },
			{ key: 'вес', v: '10 г', source: 'type' },
			{ key: 'серийный номер', v: 'A1', source: 'item' }
		]);
	});
});
