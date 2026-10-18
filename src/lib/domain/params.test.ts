import { describe, expect, it } from 'vitest';
import {
	formatDate,
	fileExtension,
	fileNameFromTemplate,
	formatFileSize,
	formatNumber,
	formatParamValue,
	inheritedParams,
	fitsHolder,
	isLink,
	isSymmetric,
	paramDefInputSchema,
	paramInputSchema,
	paramListSchema
} from './params';

const NNBSP = '\u202f';

const DEF = 'ctest00000000000000000d1';

describe('paramInputSchema', () => {
	it('accepts every value type', () => {
		const inputs = [
			{ defId: DEF, valueType: 'STRING', text: 'DIP-8' },
			{ defId: DEF, valueType: 'NUMBER', value: 85 },
			{ defId: DEF, valueType: 'RANGE', min: 4.5, max: 16 },
			{
				defId: DEF,
				valueType: 'ENUM',
				optionIds: ['ctest0000000000000000002']
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
			{ defId: DEF, valueType: 'BOOLEAN', value: false },
			{ defId: DEF, valueType: 'ITEM', refIds: ['ctest0000000000000000003'] },
			{ defId: DEF, valueType: 'TYPE', refIds: ['ctest0000000000000000004'] }
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
		expect(paramInputSchema.safeParse({ defId: DEF, valueType: 'ITEM' }).success).toBe(false);
		expect(
			paramInputSchema.safeParse({ defId: DEF, valueType: 'TYPE', refIds: [] }).error?.issues[0]
				?.message
		).toBe('Выберите тип');
	});

	it('drops repeated link targets', () => {
		const id = 'ctest0000000000000000003';
		expect(paramInputSchema.parse({ defId: DEF, valueType: 'ITEM', refIds: [id, id] })).toEqual({
			defId: DEF,
			valueType: 'ITEM',
			refIds: [id]
		});
	});

	it('drops a unit given with a value (the unit belongs to the parameter)', () => {
		expect(
			paramInputSchema.parse({ defId: DEF, valueType: 'NUMBER', value: 3, unit: 'мм' })
		).toEqual({ defId: DEF, valueType: 'NUMBER', value: 3 });
	});

	it('explains errors without a custom message in Russian (zod/mini has no default locale)', () => {
		const r = paramInputSchema.safeParse({ defId: DEF, valueType: 'NUMBER', value: 'три' });
		expect(r.error?.issues[0]?.path).toEqual(['value']);
		expect(r.error?.issues[0]?.message).toMatch(/[а-я]/);
		expect(r.error?.issues[0]?.message).not.toMatch(/Invalid/);
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
	it('trims the name and empties the unit', () => {
		expect(paramDefInputSchema.parse({ name: ' вес ', valueType: 'NUMBER' })).toEqual({
			name: 'вес',
			valueType: 'NUMBER',
			unit: null,
			fileNameTemplate: null,
			multiple: false,
			options: [],
			holder: null,
			inverseName: null
		});
		expect(paramDefInputSchema.parse({ name: 'вес', valueType: 'NUMBER', unit: ' г ' }).unit).toBe(
			'г'
		);
		expect(paramDefInputSchema.parse({ name: 'вес', valueType: 'NUMBER', unit: '' }).unit).toBe(
			null
		);
	});

	it('keeps a unit only for numbers and options only for ENUM', () => {
		expect(
			paramDefInputSchema.parse({
				name: 'цвет',
				valueType: 'STRING',
				unit: 'мм',
				multiple: true,
				options: [{ label: 'красный' }]
			})
		).toEqual({
			name: 'цвет',
			valueType: 'STRING',
			unit: null,
			fileNameTemplate: null,
			multiple: false,
			options: [],
			holder: null,
			inverseName: null
		});
		expect(
			paramDefInputSchema.parse({ name: 'напряжение', valueType: 'RANGE', unit: 'В' }).unit
		).toBe('В');
		expect(
			paramDefInputSchema.parse({
				name: 'интерфейсы',
				valueType: 'ENUM',
				unit: 'мм',
				multiple: true,
				options: [{ label: ' USB ' }, { label: 'Bluetooth' }]
			})
		).toEqual({
			name: 'интерфейсы',
			valueType: 'ENUM',
			unit: null,
			fileNameTemplate: null,
			multiple: true,
			options: [{ label: 'USB' }, { label: 'Bluetooth' }],
			holder: null,
			inverseName: null
		});
	});

	it('rejects duplicate and empty option labels', () => {
		const dup = paramDefInputSchema.safeParse({
			name: 'интерфейсы',
			valueType: 'ENUM',
			options: [{ label: 'USB' }, { label: ' usb' }]
		});
		expect(dup.success).toBe(false);
		expect(dup.error?.issues[0]).toMatchObject({
			message: 'Вариант «usb» повторяется',
			path: ['options', 1, 'label']
		});
		expect(
			paramDefInputSchema.safeParse({
				name: 'интерфейсы',
				valueType: 'ENUM',
				options: [{ label: '  ' }]
			}).success
		).toBe(false);
	});
});

describe('links', () => {
	const link = { name: 'Содержит деталь', valueType: 'ITEM', holder: 'ITEM' } as const;

	it('needs where it lives and the inverse name', () => {
		const r = paramDefInputSchema.safeParse({ name: 'Содержит деталь', valueType: 'ITEM' });
		expect(r.error?.issues.map((i) => i.message)).toEqual([
			'Укажите, где задаётся связь',
			'Укажите параметр у связанной вещи'
		]);
		expect(paramDefInputSchema.parse({ ...link, inverseName: ' Является деталью ' })).toMatchObject(
			{ holder: 'ITEM', inverseName: 'Является деталью' }
		);
	});

	it('drops link fields from other parameters', () => {
		expect(
			paramDefInputSchema.parse({
				name: 'вес',
				valueType: 'NUMBER',
				holder: 'TYPE',
				inverseName: 'x'
			})
		).toMatchObject({ holder: null, inverseName: null });
	});

	it('is symmetric with the same name both ways between holders of one kind', () => {
		const same = { name: 'Совместим с', inverseName: 'совместим С' };
		expect(isSymmetric({ ...same, valueType: 'TYPE', holder: 'TYPE' })).toBe(true);
		expect(isSymmetric({ ...same, valueType: 'TYPE', holder: 'ITEM' })).toBe(false);
		expect(isSymmetric({ ...link, inverseName: 'Является деталью' })).toBe(false);
		const mixed = paramDefInputSchema.safeParse({ ...same, valueType: 'TYPE', holder: 'ITEM' });
		expect(mixed.error?.issues[0]?.path).toEqual(['inverseName']);
	});

	it('tells where a link can live', () => {
		expect(isLink('ITEM')).toBe(true);
		expect(isLink('STRING')).toBe(false);
		expect(fitsHolder({ holder: null }, 'TYPE')).toBe(true);
		expect(fitsHolder({ holder: 'ITEM' }, 'ITEM')).toBe(true);
		expect(fitsHolder({ holder: 'ITEM' }, 'TYPE')).toBe(false);
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
		expect(f({ valueType: 'NUMBER', value: 85, unit: null })).toBe('85');
		expect(f({ valueType: 'RANGE', min: 1, max: 2 })).toBe('1–2');
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
				valueType: 'ITEM',
				refIds: ['x', 'y'],
				refs: [
					{ id: 'x', name: 'Блок питания 12 В', archived: true },
					{ id: 'y', name: 'Кабель', archived: false }
				]
			})
		).toBe('Блок питания 12 В, Кабель');
	});

	it('formats dates and sizes', () => {
		expect(formatDate('2026-12-31')).toBe('2026-12-31');
		expect(formatFileSize(500)).toBe('500 Б');
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 МБ');
	});
});

describe('inheritedParams', () => {
	it('keeps the type values the item has no own value of, in type order', () => {
		const inherited = inheritedParams(
			[
				{ defId: 'color', v: 'красный' },
				{ defId: 'weight', v: '10 г' },
				{ defId: 'size', v: 'M' }
			],
			[
				{ defId: 'serial', v: 'A1' },
				{ defId: 'color', v: 'синий' }
			]
		);
		expect(inherited).toEqual([
			{ defId: 'weight', v: '10 г' },
			{ defId: 'size', v: 'M' }
		]);
	});

	it('returns every type value when the item has none and nothing without a type', () => {
		const typeParams = [{ defId: 'color' }, { defId: 'weight' }];
		expect(inheritedParams(typeParams, [])).toEqual(typeParams);
		expect(inheritedParams([], [{ defId: 'color' }])).toEqual([]);
	});
});

describe('file names', () => {
	it('finds the extension of a file name', () => {
		expect(fileExtension('manual.pdf')).toBe('.pdf');
		expect(fileExtension('archive.tar.gz')).toBe('.gz');
		expect(fileExtension('README')).toBe('');
		expect(fileExtension('.bashrc')).toBe('');
		expect(fileExtension('scan. pdf')).toBe('');
	});

	it('names an uploaded file by the template, keeping its extension', () => {
		expect(fileNameFromTemplate('Инструкция {name}', ' Дрель Bosch ', 'manual_v2.PDF')).toBe(
			'Инструкция Дрель Bosch.PDF'
		);
		expect(fileNameFromTemplate('{name} — {NAME}', 'Дрель', 'scan')).toBe('Дрель — Дрель');
		// The template may end with the extension itself.
		expect(fileNameFromTemplate('Чек {name}.pdf', 'Дрель', 'IMG_1.pdf')).toBe('Чек Дрель.pdf');
		expect(fileNameFromTemplate('Чек\n {name}', 'Дрель', 'a.jpg')).toBe('Чек Дрель.jpg');
		// `$` sequences in the name stay as they are (no replacement patterns).
		expect(fileNameFromTemplate('Инструкция {name}', "Касса $$ и $& и $` $'", 'a.pdf')).toBe(
			"Инструкция Касса $$ и $& и $` $'.pdf"
		);
	});

	it('keeps the file own name without a template or when nothing is left of it', () => {
		expect(fileNameFromTemplate(null, 'Дрель', 'manual.pdf')).toBe('manual.pdf');
		expect(fileNameFromTemplate('', 'Дрель', 'manual.pdf')).toBe('manual.pdf');
		expect(fileNameFromTemplate('{name}', '  ', 'manual.pdf')).toBe('manual.pdf');
	});

	it('fits the name into the limit, extension included', () => {
		const name = fileNameFromTemplate('{name}', 'я'.repeat(300), 'a.pdf');
		expect(name).toHaveLength(255);
		expect(name.endsWith('я.pdf')).toBe(true);
	});

	it('keeps a default file name only for FILE parameters', () => {
		const parse = (valueType: 'FILE' | 'STRING', fileNameTemplate: string) =>
			paramDefInputSchema.parse({ name: 'Инструкция', valueType, fileNameTemplate })
				.fileNameTemplate;
		expect(parse('FILE', ' Инструкция {name} ')).toBe('Инструкция {name}');
		expect(parse('FILE', ' ')).toBe(null);
		expect(parse('STRING', 'Инструкция {name}')).toBe(null);
	});

	it('trims a file value name and rejects an empty one', () => {
		const file = {
			defId: 'c'.repeat(25),
			valueType: 'FILE',
			fileKey: 'k',
			fileMime: 'x/y',
			fileSize: 1
		};
		expect(paramInputSchema.parse({ ...file, fileName: ' a.pdf ' })).toMatchObject({
			fileName: 'a.pdf'
		});
		expect(paramInputSchema.safeParse({ ...file, fileName: '  ' }).error?.issues[0]?.message).toBe(
			'Укажите имя файла'
		);
	});
});
