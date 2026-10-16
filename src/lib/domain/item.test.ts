import { describe, expect, it } from 'vitest';
import { compareNames, formatPath, itemDisplayName } from './item';

describe('itemDisplayName', () => {
	it('prefers the own name', () => {
		expect(itemDisplayName({ name: 'Коробка с микросхемами', type: { name: 'Kuggis' } })).toBe(
			'Коробка с микросхемами'
		);
	});

	it('falls back to the type name when the own name is empty', () => {
		expect(itemDisplayName({ name: null, type: { name: 'NE555' } })).toBe('NE555');
		expect(itemDisplayName({ name: '  ', type: { name: 'NE555' } })).toBe('NE555');
	});
});

describe('formatPath', () => {
	it('joins names with arrows', () => {
		expect(formatPath([{ name: 'Шкаф' }, { name: 'Полка 2' }])).toBe('Шкаф → Полка 2');
		expect(formatPath([])).toBe('');
	});

	it('names workbenches', () => {
		expect(formatPath([{ name: 'Гараж', isWorkbench: true }])).toBe('Рабочий стол Гараж');
	});
});

describe('compareNames', () => {
	it('sorts alphabetically, ignoring case, with numbers by value', () => {
		const names = ['Винт M10', 'резистор', 'Арбуз', 'Винт M3', 'Полка 10', 'Полка 2', 'ёлка'];
		expect(names.sort(compareNames)).toEqual([
			'Арбуз',
			'Винт M3',
			'Винт M10',
			'ёлка',
			'Полка 2',
			'Полка 10',
			'резистор'
		]);
	});
});
