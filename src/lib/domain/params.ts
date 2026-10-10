/**
 * Parameters: typed key:value pairs of a type (shared by all its items) or of
 * one item. Input validation, display formatting (Russian) and the merge rule
 * for the item card. Pure functions, shared by the server and the browser.
 */
import { z } from 'zod';

export const PARAM_VALUE_TYPES = [
	'STRING',
	'NUMBER',
	'RANGE',
	'ENUM',
	'URL',
	'FILE',
	'DATE',
	'REF',
	'BOOLEAN'
] as const;

export type ParamValueType = (typeof PARAM_VALUE_TYPES)[number];

export const PARAM_VALUE_TYPE_LABELS: Record<ParamValueType, string> = {
	STRING: 'Строка',
	NUMBER: 'Число',
	RANGE: 'Диапазон',
	ENUM: 'Из справочника',
	URL: 'Ссылка (URL)',
	FILE: 'Файл',
	DATE: 'Дата',
	REF: 'Вещь или тип',
	BOOLEAN: 'Да / нет'
};

/** Largest file a FILE parameter may hold. */
export const MAX_PARAM_FILE_SIZE = 50 * 1024 * 1024;

const MAX_PARAMS = 100;

const key = z.string().trim().min(1, 'Укажите ключ').max(100, 'Ключ длиннее 100 символов');
const unit = z
	.string()
	.trim()
	.max(20, 'Единица длиннее 20 символов')
	.nullish()
	.transform((v) => v || null);
const finite = z.number().finite('Нужно число');
const uuid = z.uuid('Некорректный идентификатор');

export const paramInputSchema = z.discriminatedUnion('valueType', [
	z.object({
		key,
		valueType: z.literal('STRING'),
		text: z.string().trim().min(1, 'Пустое значение').max(1000)
	}),
	z.object({ key, valueType: z.literal('NUMBER'), value: finite, unit }),
	z
		.object({ key, valueType: z.literal('RANGE'), min: finite, max: finite, unit })
		.refine((v) => v.min <= v.max, {
			message: 'Минимум больше максимума',
			path: ['max']
		}),
	z.object({
		key,
		valueType: z.literal('ENUM'),
		dictionaryId: uuid,
		optionIds: z.array(uuid).min(1, 'Выберите вариант')
	}),
	z.object({
		key,
		valueType: z.literal('URL'),
		url: z.string().trim().max(2000).refine(isHttpUrl, 'Нужна ссылка вида https://…')
	}),
	z.object({
		key,
		valueType: z.literal('FILE'),
		fileKey: z.string().min(1).max(500),
		fileName: z.string().min(1).max(255),
		fileMime: z.string().min(1).max(255),
		fileSize: z.number().int().min(0).max(MAX_PARAM_FILE_SIZE)
	}),
	z.object({
		key,
		valueType: z.literal('DATE'),
		date: z.string().refine(isIsoDate, 'Нужна дата ГГГГ-ММ-ДД')
	}),
	z
		.object({
			key,
			valueType: z.literal('REF'),
			refItemId: uuid.nullish().transform((v) => v ?? null),
			refTypeId: uuid.nullish().transform((v) => v ?? null)
		})
		.refine((v) => (v.refItemId === null) !== (v.refTypeId === null), {
			message: 'Выберите вещь или тип',
			path: ['refItemId']
		}),
	z.object({ key, valueType: z.literal('BOOLEAN'), value: z.boolean() })
]);

export type ParamInput = z.infer<typeof paramInputSchema>;
export type ParamValue = DistributiveOmit<ParamInput, 'key'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A whole parameter list; keys must be unique (case-insensitive). */
export const paramListSchema = z
	.array(paramInputSchema)
	.max(MAX_PARAMS, `Не больше ${MAX_PARAMS} параметров`)
	.superRefine((params, ctx) => {
		const seen = new Set<string>();
		params.forEach((p, i) => {
			const k = normalizeParamKey(p.key);
			if (seen.has(k)) {
				ctx.addIssue({
					code: 'custom',
					message: `Ключ «${p.key}» повторяется`,
					path: [i, 'key']
				});
			}
			seen.add(k);
		});
	});

/**
 * A stored parameter as shown to the user: the input fields plus what the
 * server resolved (enum option labels in dictionary order, the REF target).
 */
export type ParamView = ParamInput & {
	id: string;
	/** ENUM: chosen options; renaming an option shows here at once. */
	options?: { id: string; label: string }[];
	/** REF: the target, or null when it no longer exists. */
	ref?: { kind: 'item' | 'type'; id: string; name: string; archived: boolean } | null;
};

export type ParamSource = 'type' | 'item';
export type MergedParam = ParamView & { source: ParamSource };

/** Key comparison is case-insensitive and ignores surrounding spaces. */
export function normalizeParamKey(k: string): string {
	return k.trim().toLocaleLowerCase('ru');
}

/**
 * Type and item parameters as seen on the item card: an item value overrides
 * the type value with the same key (shown at the type parameter's position);
 * the item's own extra parameters follow.
 */
export function mergeParams<T extends { key: string }>(
	typeParams: T[],
	itemParams: T[]
): (T & { source: ParamSource })[] {
	const own = new Map(itemParams.map((p) => [normalizeParamKey(p.key), p]));
	const used = new Set<string>();
	const merged: (T & { source: ParamSource })[] = typeParams.map((p) => {
		const k = normalizeParamKey(p.key);
		const override = own.get(k);
		if (!override) return { ...p, source: 'type' };
		used.add(k);
		return { ...override, source: 'item' };
	});
	for (const p of itemParams) {
		if (!used.has(normalizeParamKey(p.key))) merged.push({ ...p, source: 'item' });
	}
	return merged;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Narrow no-break space: Russian thousands separator («4 500»). */
const THOUSANDS = '\u202f';

/** «4500.5» → «4 500,5»: comma decimals, thin-space thousands. */
export function formatNumber(n: number): string {
	const sign = n < 0 ? '−' : '';
	// Up to 6 decimals, trailing zeros dropped; avoids 0.1 + 0.2 noise.
	const [int = '0', frac] = Math.abs(n)
		.toFixed(6)
		.replace(/\.?0+$/, '')
		.split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS);
	return sign + (frac ? `${grouped},${frac}` : grouped);
}

function withUnit(text: string, u: string | null | undefined): string {
	return u ? `${text} ${u}` : text;
}

const MONTHS_GENITIVE = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря'
];

/** «2027-05-01» → «1 мая 2027». */
export function formatDate(iso: string): string {
	if (!isIsoDate(iso)) return iso;
	const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
	return `${d} ${MONTHS_GENITIVE[m - 1]} ${y}`;
}

/** File size for people: «2,4 МБ». */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} Б`;
	if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 102.4) / 10)} КБ`;
	return `${formatNumber(Math.round(bytes / (1024 * 102.4)) / 10)} МБ`;
}

/** The value of a parameter as one line of text. */
export function formatParamValue(p: ParamValue & Pick<ParamView, 'options' | 'ref'>): string {
	switch (p.valueType) {
		case 'STRING':
			return p.text;
		case 'NUMBER':
			return withUnit(formatNumber(p.value), p.unit);
		case 'RANGE':
			return withUnit(`${formatNumber(p.min)}–${formatNumber(p.max)}`, p.unit);
		case 'ENUM':
			return (p.options ?? []).map((o) => o.label).join(', ');
		case 'URL':
			return p.url;
		case 'FILE':
			return p.fileName;
		case 'DATE':
			return formatDate(p.date);
		case 'REF':
			return p.ref ? p.ref.name : 'удалено';
		case 'BOOLEAN':
			return p.value ? 'да' : 'нет';
	}
}

/** True for a real calendar date in the form YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isHttpUrl(s: string): boolean {
	try {
		const u = new URL(s);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}
