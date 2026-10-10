import { describe, expect, it } from 'vitest';
import {
	describeEvent,
	diffFields,
	formatChangeValue,
	historyHref,
	historySearch,
	kindsOfGroup,
	parseHistoryFilters,
	type HistoryEventView,
	type Segment
} from './history';

const plain = (segments: Segment[]) => segments.map((s) => s.text).join('');

function event(partial: Partial<HistoryEventView>): HistoryEventView {
	return {
		id: 'e1',
		kind: 'item.created',
		subjectKind: 'item',
		subjectId: 'i1',
		subjectName: 'Отвёртка',
		data: {},
		createdAt: '2026-10-10T12:00:00Z',
		actor: null,
		live: [],
		...partial
	};
}

describe('parseHistoryFilters', () => {
	it('reads known filters and ignores the rest', () => {
		const f = parseHistoryFilters(
			new URLSearchParams('entity=cabc123&actor=u1&group=moves&subject=type&x=1')
		);
		expect(f).toEqual({ entity: 'cabc123', actor: 'u1', group: 'moves', subject: 'type' });
	});

	it('drops unknown groups, subjects and malformed ids', () => {
		const f = parseHistoryFilters(
			new URLSearchParams('entity=a%20b&group=toString&subject=user&actor=')
		);
		expect(f).toEqual({ entity: null, actor: null, group: null, subject: null });
	});
});

describe('historySearch / historyHref', () => {
	it('builds a query string from set values only', () => {
		expect(historySearch({ entity: 'c1', actor: null, group: 'archive' })).toBe(
			'?entity=c1&group=archive'
		);
		expect(historySearch({}, { before: 'e9' })).toBe('?before=e9');
		expect(historyHref({})).toBe('/history');
		expect(historyHref({ entity: 'c1' })).toBe('/history?entity=c1');
	});
});

describe('kindsOfGroup', () => {
	it('splits kinds into groups', () => {
		expect(kindsOfGroup('moves')).toEqual(['item.moved', 'item.taken', 'item.returned']);
		expect(kindsOfGroup('archive')).toContain('item.purged');
		expect(kindsOfGroup('stickers')).toContain('stickers.issued');
	});
});

describe('diffFields', () => {
	it('keeps only fields that really changed; undefined means "not touched"', () => {
		expect(
			diffFields(
				{ name: 'Ящик', description: null, isContainer: false },
				{ name: 'Ящик', description: '', isContainer: true }
			)
		).toEqual([{ field: 'isContainer', before: false, after: true }]);
		expect(diffFields({ name: 'А', quantity: 3 }, { name: undefined, quantity: 5 })).toEqual([
			{ field: 'quantity', before: 3, after: 5 }
		]);
	});
});

describe('formatChangeValue', () => {
	it('formats empty, boolean and long values', () => {
		expect(formatChangeValue(null)).toBe('—');
		expect(formatChangeValue(true)).toBe('да');
		expect(formatChangeValue('x'.repeat(100))).toHaveLength(80);
	});
});

describe('describeEvent', () => {
	it('links only entities that still exist', () => {
		const text = describeEvent(
			event({
				kind: 'item.moved',
				data: {
					quantity: 2,
					of: 5,
					from: { id: 'box', name: 'Коробка', kind: 'item' },
					to: { id: 'bench', name: 'Гараж', kind: 'workbench' }
				},
				live: ['i1', 'bench']
			})
		);
		expect(plain(text.title)).toBe('Вещь Отвёртка перемещена (2 из 5 шт.)');
		expect(text.title[1]).toEqual({ text: 'Отвёртка', href: '/items/i1' });
		expect(plain(text.details[0]!)).toBe('Коробка → Рабочий стол Гараж');
		expect(text.details[0]![0]!.href).toBeUndefined();
		expect(text.details[0]![2]!.href).toBe('/items/bench');
	});

	it('reads the top level as such', () => {
		const text = describeEvent(
			event({ kind: 'item.moved', data: { quantity: 1, of: 1, from: null, to: null } })
		);
		expect(plain(text.title)).toBe('Вещь Отвёртка перемещена');
		expect(plain(text.details[0]!)).toBe('Верхний уровень → верхний уровень');
	});

	it('lists field changes', () => {
		const text = describeEvent(
			event({
				kind: 'type.updated',
				subjectKind: 'type',
				subjectName: 'Коробка',
				data: {
					changes: [
						{ field: 'name', before: 'Ящик', after: 'Коробка' },
						{ field: 'isContainer', before: false, after: true }
					]
				}
			})
		);
		expect(plain(text.title)).toBe('Тип Коробка изменён');
		expect(text.details.map(plain)).toEqual([
			'Название: «Ящик» → «Коробка»',
			'Контейнер: нет → да'
		]);
	});

	it('describes archive, stickers and parameters', () => {
		expect(
			plain(
				describeEvent(event({ kind: 'item.discarded', data: { consumed: true, quantity: 1 } }))
					.title
			)
		).toBe('Вещь Отвёртка использована целиком и ушла в архив');
		expect(
			plain(describeEvent(event({ kind: 'sticker.bound', data: { code: 'K7M4QX' } })).title)
		).toBe('Наклейка K7M-4QX наклеена на вещь Отвёртка');
		expect(plain(describeEvent(event({ kind: 'sticker.ordered', data: {} })).title)).toBe(
			'Заказана наклейка для вещи Отвёртка'
		);
		expect(
			plain(describeEvent(event({ kind: 'sticker.printed', data: { code: 'K7M4QX' } })).title)
		).toBe('Наклейка K7M-4QX напечатана по заказу для вещи Отвёртка');
		const unprinted = describeEvent(
			event({ kind: 'stickers.unprinted', subjectKind: 'batch', data: { count: 140, ordered: 2 } })
		);
		expect(plain(unprinted.title)).toBe('Наклейки не распечатаны, ID освобождены: 140 шт.');
		expect(unprinted.details.map(plain)).toEqual(['Снова ждут наклейку: 2']);
		const params = describeEvent(
			event({
				kind: 'params.changed',
				subjectKind: 'type',
				subjectName: 'Резистор',
				data: {
					changes: [
						{ name: 'Сопротивление', change: 'changed' },
						{ name: 'Цвет', change: 'removed' }
					]
				}
			})
		);
		expect(plain(params.title)).toBe('Параметры типа Резистор изменены');
		expect(params.details.map(plain)).toEqual(['«Сопротивление» изменён', '«Цвет» удалён']);
		expect(
			plain(
				describeEvent(
					event({
						kind: 'workbench.created',
						subjectKind: 'workbench',
						subjectName: 'Гараж',
						data: {}
					})
				).title
			)
		).toBe('Рабочий стол Гараж создан');
	});
});
