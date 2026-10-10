/**
 * History («История»): event kinds, their data, filters and how an event reads.
 * Events are written by the services (src/lib/server/services/history.ts) and
 * keep names as they were at the moment, so they read the same after renames
 * and deletions.
 */
import { formatCode } from './sticker-code';
import { pathNodeName } from './item';

export type SubjectKind = 'item' | 'workbench' | 'type' | 'paramDef' | 'batch';

/** A place or another entity as it was at the moment of the event. */
export interface EntityRef {
	id: string;
	name: string;
	kind: SubjectKind;
}

/** null = the top level. */
export type Place = EntityRef | null;

export type ChangeField =
	| 'name'
	| 'quantity'
	| 'description'
	| 'isContainer'
	| 'unit'
	| 'valueType'
	| 'multiple'
	| 'options'
	| 'icon'
	| 'geofence';

export type ChangeValue = string | number | boolean | null;

export interface Change {
	field: ChangeField;
	before: ChangeValue;
	after: ChangeValue;
}

export interface ParamChange {
	/** Parameter name. */
	name: string;
	change: 'added' | 'changed' | 'removed';
}

/** Data of each event kind (the `data` column). `backfilled` marks events carried over from the database. */
export interface HistoryDataMap {
	'item.created': { quantity?: number; to?: Place };
	'item.updated': { changes: Change[] };
	/** `quantity` < `of` → a part was split off into `resultId`. */
	'item.moved': { quantity: number; of: number; from: Place; to: Place; resultId?: string };
	'item.taken': { quantity: number; of?: number; from: Place; to: Place; resultId?: string };
	'item.returned': { quantity: number; of: number; from: Place; to: Place; resultId?: string };
	/** `thrownAway`: «Выкинуть N шт.» rather than «Использовать N шт.». */
	'item.consumed': { quantity: number; left: number; thrownAway?: boolean };
	/** `together`: contents archived with it; `consumed`: «Использовать» took all of it. */
	'item.discarded': { quantity?: number; from?: Place; together?: number; consumed?: boolean };
	'item.restored': { to: Place; together: number };
	'item.purged': { together: number };
	'sticker.bound': { code: string; resultId?: string };
	'sticker.unbound': { code: string };
	'sticker.ordered': Record<string, never>;
	'sticker.orderCancelled': Record<string, never>;
	/** An ordered sticker printed in a batch and bound to the item (`resultId` when split off). */
	'sticker.printed': { code: string; resultId?: string };
	'params.changed': { changes: ParamChange[] };
	'type.created': Record<string, never>;
	'type.updated': { changes: Change[] };
	'type.deleted': Record<string, never>;
	'type.photo': { removed: boolean };
	'paramDef.created': Record<string, never>;
	'paramDef.updated': { changes: Change[] };
	'paramDef.deleted': Record<string, never>;
	'workbench.created': Record<string, never>;
	'workbench.updated': { changes: Change[] };
	'workbench.deleted': Record<string, never>;
	/** `ordered`: how many of them were printed for ordered items. */
	'stickers.issued': { count: number; ordered?: number };
	/** The batch was marked unprinted and deleted; `ordered` items got their orders back. */
	'stickers.unprinted': { count: number; ordered?: number };
}

export type HistoryKind = keyof HistoryDataMap;

export type HistoryData<K extends HistoryKind = HistoryKind> = HistoryDataMap[K] & {
	backfilled?: boolean;
};

export const HISTORY_GROUPS = {
	moves: 'Перемещения',
	changes: 'Изменения',
	archive: 'Архив',
	stickers: 'Наклейки'
} as const;

export type HistoryGroup = keyof typeof HISTORY_GROUPS;

const GROUP_OF: Record<HistoryKind, HistoryGroup> = {
	'item.created': 'changes',
	'item.updated': 'changes',
	'item.moved': 'moves',
	'item.taken': 'moves',
	'item.returned': 'moves',
	'item.consumed': 'changes',
	'item.discarded': 'archive',
	'item.restored': 'archive',
	'item.purged': 'archive',
	'sticker.bound': 'stickers',
	'sticker.unbound': 'stickers',
	'sticker.ordered': 'stickers',
	'sticker.orderCancelled': 'stickers',
	'sticker.printed': 'stickers',
	'params.changed': 'changes',
	'type.created': 'changes',
	'type.updated': 'changes',
	'type.deleted': 'changes',
	'type.photo': 'changes',
	'paramDef.created': 'changes',
	'paramDef.updated': 'changes',
	'paramDef.deleted': 'changes',
	'workbench.created': 'changes',
	'workbench.updated': 'changes',
	'workbench.deleted': 'changes',
	'stickers.issued': 'stickers',
	'stickers.unprinted': 'stickers'
};

export const HISTORY_KINDS = Object.keys(GROUP_OF) as HistoryKind[];

export function kindsOfGroup(group: HistoryGroup): HistoryKind[] {
	return HISTORY_KINDS.filter((k) => GROUP_OF[k] === group);
}

export const SUBJECT_LABELS: Record<SubjectKind, string> = {
	item: 'Вещи',
	workbench: 'Рабочие столы',
	type: 'Типы',
	paramDef: 'Параметры',
	batch: 'Листы наклеек'
};

// ---------------------------------------------------------------------------
// Filters (query parameters of /history)
// ---------------------------------------------------------------------------

/**
 * Filters of the history list. In the URL: `?entity=<id>` (events of one
 * item, type, parameter… including where it is only involved, e.g. things put
 * into a container), `?actor=<user id>`, `?group=moves|changes|archive|stickers`,
 * `?subject=item|workbench|type|paramDef|batch`.
 */
export interface HistoryFilters {
	entity: string | null;
	actor: string | null;
	group: HistoryGroup | null;
	subject: SubjectKind | null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function idParam(value: string | null): string | null {
	return value && ID_PATTERN.test(value) ? value : null;
}

/** Reads filters from query parameters; unknown values are ignored. */
export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
	const group = params.get('group');
	const subject = params.get('subject');
	return {
		entity: idParam(params.get('entity')),
		actor: idParam(params.get('actor')),
		group: group && Object.hasOwn(HISTORY_GROUPS, group) ? (group as HistoryGroup) : null,
		subject: subject && Object.hasOwn(SUBJECT_LABELS, subject) ? (subject as SubjectKind) : null
	};
}

/** Query string for filters (with `?`, or '' when there are none), plus extra parameters. */
export function historySearch(
	filters: Partial<HistoryFilters>,
	extra: Record<string, string | null | undefined> = {}
): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries({ ...filters, ...extra })) {
		if (value) params.set(key, value);
	}
	const s = params.toString();
	return s ? `?${s}` : '';
}

/** Link to the history of one entity or actor: `historyHref({ entity: item.id })`. */
export function historyHref(filters: Partial<HistoryFilters>): string {
	return `/history${historySearch(filters)}`;
}

// ---------------------------------------------------------------------------
// How an event reads
// ---------------------------------------------------------------------------

/** Text with an optional link to the entity (only when it still exists). */
export interface Segment {
	text: string;
	href?: string;
}

export interface HistoryEventView {
	id: string;
	kind: HistoryKind;
	subjectKind: SubjectKind;
	subjectId: string;
	subjectName: string;
	data: HistoryData;
	createdAt: Date | string;
	actor: { id: string; name: string } | null;
	/** Ids of the entities in the event that still exist and are visible (get links). */
	live: string[];
}

export interface HistoryPage {
	events: HistoryEventView[];
	/** Pass as `before` to get the next (older) page; null when there is none. */
	nextCursor: string | null;
}

export interface EventText {
	title: Segment[];
	/** Extra lines: what changed, from where to where. */
	details: Segment[][];
}

export function entityHref(kind: SubjectKind, id: string): string {
	switch (kind) {
		case 'item':
		case 'workbench':
			return `/items/${id}`;
		case 'type':
			return `/types/${id}`;
		case 'paramDef':
			return `/params/${id}`;
		case 'batch':
			return '/stickers';
	}
}

const FIELD_LABELS: Record<ChangeField, string> = {
	name: 'Название',
	quantity: 'Количество',
	description: 'Описание',
	isContainer: 'Контейнер',
	unit: 'Единица',
	valueType: 'Тип значения',
	multiple: 'Несколько вариантов',
	options: 'Варианты',
	icon: 'Иконка',
	geofence: 'Геозона'
};

/** Long values (descriptions) are cut to this many characters. */
const CHANGE_VALUE_MAX = 80;

export function formatChangeValue(value: ChangeValue): string {
	if (value === null || value === '') return '—';
	if (typeof value === 'boolean') return value ? 'да' : 'нет';
	const s = String(value);
	return s.length > CHANGE_VALUE_MAX ? `${s.slice(0, CHANGE_VALUE_MAX - 1)}…` : s;
}

function changeLine({ field, before, after }: Change): Segment[] {
	const quote = (v: ChangeValue) =>
		typeof v === 'string' && v !== '' && field !== 'valueType' && field !== 'options'
			? `«${formatChangeValue(v)}»`
			: formatChangeValue(v);
	return [{ text: `${FIELD_LABELS[field]}: ${quote(before)} → ${quote(after)}` }];
}

const PARAM_CHANGE: Record<ParamChange['change'], string> = {
	added: 'добавлен',
	changed: 'изменён',
	removed: 'удалён'
};

/** Builds the text of an event; `live` decides which names become links. */
export function describeEvent(e: HistoryEventView): EventText {
	const live = new Set(e.live);
	const link = (ref: EntityRef): Segment => {
		const text = ref.kind === 'workbench' ? pathNodeName({ ...ref, isWorkbench: true }) : ref.name;
		return live.has(ref.id) ? { text, href: entityHref(ref.kind, ref.id) } : { text };
	};
	const subject = link({ id: e.subjectId, name: e.subjectName, kind: e.subjectKind });
	const place = (p: Place | undefined, first = false): Segment =>
		p ? link(p) : { text: first ? 'Верхний уровень' : 'верхний уровень' };
	const t = (text: string): Segment => ({ text });
	const part = (quantity: number, of?: number): Segment[] =>
		of !== undefined && quantity < of
			? [t(` (${quantity} из ${of} шт.)`)]
			: quantity > 1
				? [t(` (${quantity} шт.)`)]
				: [];
	const changes = (list: Change[]) => list.map(changeLine);

	switch (e.kind) {
		case 'item.created': {
			const d = e.data as HistoryData<'item.created'>;
			return {
				title: [t('Вещь '), subject, t(' создана'), ...part(d.quantity ?? 1)],
				details: d.to !== undefined ? [[t('Положена в: '), place(d.to)]] : []
			};
		}
		case 'item.updated':
			return {
				title: [t('Вещь '), subject, t(' изменена')],
				details: changes((e.data as HistoryData<'item.updated'>).changes)
			};
		case 'item.moved': {
			const d = e.data as HistoryData<'item.moved'>;
			return {
				title: [t('Вещь '), subject, t(' перемещена'), ...part(d.quantity, d.of)],
				details: [[place(d.from, true), t(' → '), place(d.to)]]
			};
		}
		case 'item.taken': {
			const d = e.data as HistoryData<'item.taken'>;
			return {
				title: [t('Вещь '), subject, t(' взята на стол'), ...part(d.quantity, d.of)],
				details: [[place(d.from, true), t(' → '), place(d.to)]]
			};
		}
		case 'item.returned': {
			const d = e.data as HistoryData<'item.returned'>;
			return {
				title: [t('Вещь '), subject, t(' возвращена на место'), ...part(d.quantity, d.of)],
				details: [[place(d.from, true), t(' → '), place(d.to)]]
			};
		}
		case 'item.consumed': {
			const d = e.data as HistoryData<'item.consumed'>;
			return {
				title: [
					t('Вещь '),
					subject,
					t(`${d.thrownAway ? ' выкинута' : ' использована'}: ${d.quantity} шт.`)
				],
				details: [[t(`Осталось ${d.left} шт.`)]]
			};
		}
		case 'item.discarded': {
			const d = e.data as HistoryData<'item.discarded'>;
			const details: Segment[][] = [];
			if (d.from !== undefined) details.push([t('Лежала: '), place(d.from)]);
			if (d.together) details.push([t(`Вместе с ней в архив: ${d.together}`)]);
			return {
				title: [
					t('Вещь '),
					subject,
					t(d.consumed ? ' использована целиком и ушла в архив' : ' выкинута в архив'),
					...part(d.quantity ?? 1)
				],
				details
			};
		}
		case 'item.restored': {
			const d = e.data as HistoryData<'item.restored'>;
			const details: Segment[][] = [[t('Теперь лежит: '), place(d.to)]];
			if (d.together) details.push([t(`Вместе с ней: ${d.together}`)]);
			return { title: [t('Вещь '), subject, t(' восстановлена из архива')], details };
		}
		case 'item.purged': {
			const d = e.data as HistoryData<'item.purged'>;
			return {
				title: [t('Вещь '), subject, t(' удалена навсегда')],
				details: d.together ? [[t(`Вместе с ней: ${d.together}`)]] : []
			};
		}
		case 'sticker.bound': {
			const d = e.data as HistoryData<'sticker.bound'>;
			return {
				title: [t(`Наклейка ${formatCode(d.code)} наклеена на вещь `), subject],
				details: []
			};
		}
		case 'sticker.unbound': {
			const d = e.data as HistoryData<'sticker.unbound'>;
			return {
				title: [t(`Наклейка ${formatCode(d.code)} снята с вещи `), subject],
				details: []
			};
		}
		case 'sticker.ordered':
			return { title: [t('Наклейка ждёт печати для вещи '), subject], details: [] };
		case 'sticker.orderCancelled':
			return { title: [t('Наклейка больше не ждёт печати для вещи '), subject], details: [] };
		case 'sticker.printed': {
			const d = e.data as HistoryData<'sticker.printed'>;
			return {
				title: [t(`Наклейка ${formatCode(d.code)} напечатана для вещи `), subject],
				details: []
			};
		}
		case 'params.changed': {
			const d = e.data as HistoryData<'params.changed'>;
			const owner = e.subjectKind === 'type' ? 'типа ' : 'вещи ';
			return {
				title: [t(`Параметры ${owner}`), subject, t(' изменены')],
				details: d.changes.map((c) => [t(`«${c.name}» ${PARAM_CHANGE[c.change]}`)])
			};
		}
		case 'type.created':
			return { title: [t('Тип '), subject, t(' создан')], details: [] };
		case 'type.updated':
			return {
				title: [t('Тип '), subject, t(' изменён')],
				details: changes((e.data as HistoryData<'type.updated'>).changes)
			};
		case 'type.deleted':
			return { title: [t('Тип '), subject, t(' удалён')], details: [] };
		case 'type.photo': {
			const d = e.data as HistoryData<'type.photo'>;
			return {
				title: [t('Фото типа '), subject, t(d.removed ? ' удалено' : ' обновлено')],
				details: []
			};
		}
		case 'paramDef.created':
			return { title: [t('Параметр '), subject, t(' создан')], details: [] };
		case 'paramDef.updated':
			return {
				title: [t('Параметр '), subject, t(' изменён')],
				details: changes((e.data as HistoryData<'paramDef.updated'>).changes)
			};
		case 'paramDef.deleted':
			return { title: [t('Параметр '), subject, t(' удалён')], details: [] };
		case 'workbench.created':
			return { title: [subject, t(' создан')], details: [] };
		case 'workbench.updated':
			return {
				title: [subject, t(' изменён')],
				details: changes((e.data as HistoryData<'workbench.updated'>).changes)
			};
		case 'workbench.deleted':
			return { title: [subject, t(' удалён')], details: [] };
		case 'stickers.issued': {
			const d = e.data as HistoryData<'stickers.issued'>;
			return {
				title: [
					live.has(e.subjectId)
						? { text: 'Выпущены наклейки', href: '/stickers' }
						: t('Выпущены наклейки'),
					t(`: ${d.count} шт.`)
				],
				details: d.ordered ? [[t(`Для вещей: ${d.ordered}`)]] : []
			};
		}
		case 'stickers.unprinted': {
			const d = e.data as HistoryData<'stickers.unprinted'>;
			return {
				title: [t(`Наклейки не распечатаны, ID освобождены: ${d.count} шт.`)],
				details: d.ordered ? [[t(`Снова ждут печати: ${d.ordered}`)]] : []
			};
		}
	}
}

/** Only the entity changes worth an event: fields whose value really differs. */
export function diffFields(
	before: Partial<Record<ChangeField, ChangeValue>>,
	after: Partial<Record<ChangeField, ChangeValue | undefined>>
): Change[] {
	const result: Change[] = [];
	for (const [field, value] of Object.entries(after) as [ChangeField, ChangeValue | undefined][]) {
		if (value === undefined) continue;
		const old = before[field] ?? null;
		const norm = (v: ChangeValue) => (v === '' ? null : v);
		if (norm(old) !== norm(value)) result.push({ field, before: old, after: value });
	}
	return result;
}
