import { describe, expect, it } from 'vitest';
import { formatPath, itemDisplayName } from './item';

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
