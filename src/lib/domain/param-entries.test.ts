import { describe, expect, it } from 'vitest';
import type { RequiredParam } from './categories';
import type { ParamDefView } from './params';
import { addedEntry, withRequired } from './param-entries';

const def = (id: string, name: string): ParamDefView =>
	({ id, name, valueType: 'STRING', unit: null }) as ParamDefView;
const food = { id: 'cat1', name: 'Еда' };
const req = (d: ParamDefView): RequiredParam => ({ def: d, level: 'ITEM', categories: [food] });

describe('withRequired', () => {
	const expiry = def('d1', 'Срок годности');
	const color = def('d2', 'Цвет');
	const note = def('d3', 'Заметка');

	it('puts required values first and keeps what was typed', () => {
		const added = addedEntry(color);
		const first = withRequired([added], [req(expiry)]);
		expect(first.map((e) => [e.def.name, e.categories.length])).toEqual([
			['Срок годности', 1],
			['Цвет', 0]
		]);
		first[0]!.draft.text = '2026-10-20';
		const again = withRequired(first, [req(expiry), req(color)]);
		expect(again.map((e) => e.def.name)).toEqual(['Срок годности', 'Цвет']);
		expect(again[0]!.draft.text).toBe('2026-10-20');
		expect(again[1]!.draft).toBe(added.draft);
	});

	it('drops an untouched value no longer required, keeps typed and added ones', () => {
		const list = withRequired([addedEntry(note)], [req(expiry), req(color)]);
		list[1]!.draft.text = 'красный';
		expect(withRequired(list, []).map((e) => [e.def.name, e.categories.length])).toEqual([
			['Цвет', 0],
			['Заметка', 0]
		]);
	});
});
