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
		expect(plain(text.title)).toBe('Вещь Отвёртка перемещена (2 из 5)');
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

	it('old sticker events name the record split off for the sticker', () => {
		for (const kind of ['sticker.bound', 'sticker.printed'] as const) {
			const text = describeEvent(
				event({ kind, data: { code: 'K7M4QX', resultId: 'i2' }, live: ['i2'] })
			);
			expect(text.details.map(plain)).toEqual(['Отделена 1 штука: Отвёртка']);
			expect(text.details[0]![1]).toEqual({ text: 'Отвёртка', href: '/items/i2' });
		}
	});

	it('an unknown kind reads as a plain line instead of failing', () => {
		const text = describeEvent(event({ kind: 'item.teleported' as never, data: {} }));
		expect(plain(text.title)).toBe('Событие: Отвёртка');
		expect(text.details).toEqual([]);
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
			'Наклейка ждёт печати для вещи Отвёртка'
		);
		expect(
			plain(describeEvent(event({ kind: 'sticker.printed', data: { code: 'K7M4QX' } })).title)
		).toBe('Наклейка K7M-4QX напечатана для вещи Отвёртка');
		const caption = describeEvent(
			event({
				kind: 'sticker.captionChanged',
				data: { before: 'Отвёртка', after: 'Отвёртка крестовая' }
			})
		);
		expect(plain(caption.title)).toBe('Изменена подпись наклейки для вещи Отвёртка');
		expect(caption.details.map(plain)).toEqual(['«Отвёртка» → «Отвёртка крестовая»']);
		const unprinted = describeEvent(
			event({ kind: 'stickers.unprinted', subjectKind: 'batch', data: { count: 140, ordered: 2 } })
		);
		expect(plain(unprinted.title)).toBe('Наклейки не распечатаны, ID освобождены: 140');
		expect(unprinted.details.map(plain)).toEqual(['Снова ждут печати: 2']);
		const width = describeEvent(
			event({ kind: 'sticker.widthChanged', data: { before: 20, after: 40 } })
		);
		expect(plain(width.title)).toBe('Изменена ширина наклейки для вещи Отвёртка');
		expect(width.details.map(plain)).toEqual(['20 мм → 40 мм']);
		expect(
			plain(describeEvent(event({ kind: 'sticker.unprinted', data: { code: 'K7M4QX' } })).title)
		).toBe('Наклейка K7M-4QX не распечатана, снова ждёт печати для вещи Отвёртка');
		const params = describeEvent(
			event({
				kind: 'params.changed',
				subjectKind: 'type',
				subjectName: 'Резистор',
				data: {
					changes: [
						{ name: 'Сопротивление', change: 'changed' },
						{ name: 'Цвет', change: 'removed' },
						{ name: 'Вес', change: 'moved' }
					]
				}
			})
		);
		expect(plain(params.title)).toBe('Параметры типа Резистор изменены');
		expect(params.details.map(plain)).toEqual([
			'«Сопротивление» изменён',
			'«Цвет» удалён',
			'«Вес» перемещён в списке'
		]);
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

	it('describes categories', () => {
		const params = describeEvent(
			event({
				kind: 'category.params',
				subjectKind: 'category',
				subjectName: 'Еда',
				data: {
					changes: [
						{ name: 'Срок годности', change: 'added', level: 'ITEM' },
						{ name: 'Калорийность', change: 'level', level: 'TYPE' },
						{ name: 'Состав', change: 'removed', level: 'TYPE' }
					]
				}
			})
		);
		expect(plain(params.title)).toBe('Параметры категории Еда изменены');
		expect(params.details.map(plain)).toEqual([
			'«Срок годности» обязателен у каждой вещи',
			'«Калорийность» теперь обязателен у типа',
			'«Состав» больше не обязателен'
		]);
		const added = describeEvent(
			event({
				kind: 'type.category',
				subjectKind: 'type',
				subjectName: 'Гречка',
				subjectId: 't1',
				data: { category: { id: 'c1', name: 'Еда', kind: 'category' }, removed: false },
				live: ['t1', 'c1']
			})
		);
		expect(plain(added.title)).toBe('Тип Гречка добавлен в категорию Еда');
		expect(added.title.at(-1)).toEqual({ text: 'Еда', href: '/categories/c1' });
	});

	it('describes collections', () => {
		const added = describeEvent(
			event({
				kind: 'collection.entry',
				subjectKind: 'collection',
				subjectId: 'col1',
				subjectName: 'Умные весы',
				data: { target: { id: 't1', name: 'ESP32', kind: 'type' }, change: 'added', quantity: 3 },
				live: ['col1', 't1']
			})
		);
		expect(plain(added.title)).toBe('Коллекция Умные весы — добавлено: тип ESP32');
		expect(added.title[1]).toEqual({ text: 'Умные весы', href: '/collections/col1' });
		expect(added.title.at(-1)).toEqual({ text: 'ESP32', href: '/types/t1' });
		expect(added.details.map(plain)).toEqual(['Количество: 3 штуки']);

		const changed = describeEvent(
			event({
				kind: 'collection.entry',
				subjectKind: 'collection',
				subjectName: 'Умные весы',
				data: {
					target: { id: 'i1', name: 'Весы кухонные', kind: 'item' },
					change: 'quantity',
					quantity: 2,
					before: 1
				}
			})
		);
		expect(plain(changed.title)).toBe('Коллекция Умные весы — изменено количество: Весы кухонные');
		expect(changed.details.map(plain)).toEqual(['Количество: 1 → 2']);

		const deleted = describeEvent(
			event({
				kind: 'collection.deleted',
				subjectKind: 'collection',
				subjectName: 'Поход',
				data: { entries: 4 }
			})
		);
		expect(plain(deleted.title)).toBe('Коллекция Поход удалена');
		expect(deleted.details.map(plain)).toEqual(['Позиций в ней было: 4']);
		expect(parseHistoryFilters(new URLSearchParams('subject=collection')).subject).toBe(
			'collection'
		);
	});
});
