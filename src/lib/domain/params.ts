/**
 * Parameters. A parameter definition (ParamDef, «Параметры» page) has a name
 * and a value type; types and items hold typed values of definitions. Input
 * validation, display formatting and the merge rule for the item card. Pure
 * functions, shared by the server and the browser.
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
	ENUM: 'Выпадающий список',
	URL: 'Ссылка (URL)',
	FILE: 'Файл',
	DATE: 'Дата',
	REF: 'Вещь или тип',
	BOOLEAN: 'Да / нет'
};

/** Largest file a FILE parameter may hold. */
export const MAX_PARAM_FILE_SIZE = 50 * 1024 * 1024;

const MAX_PARAMS = 100;

const unit = z
	.string()
	.trim()
	.max(20, 'Единица длиннее 20 символов')
	.nullish()
	.transform((v) => v || null);
const finite = z.number().finite('Нужно число');
const uuid = z.uuid('Некорректный идентификатор');

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const paramNameSchema = z
	.string()
	.trim()
	.min(1, 'Укажите название параметра')
	.max(100, 'Название длиннее 100 символов');

/** A new or changed parameter definition; ENUM needs its drop-down list. */
export const paramDefInputSchema = z
	.object({
		name: paramNameSchema,
		valueType: z.enum(PARAM_VALUE_TYPES),
		dictionaryId: uuid.nullish().transform((v) => v ?? null)
	})
	.refine((v) => v.valueType !== 'ENUM' || v.dictionaryId !== null, {
		message: 'Выберите выпадающий список',
		path: ['dictionaryId']
	})
	.transform((v) => (v.valueType === 'ENUM' ? v : { ...v, dictionaryId: null }));

export type ParamDefInput = z.input<typeof paramDefInputSchema>;

/** A parameter definition as listed on the «Параметры» page and in pickers. */
export interface ParamDefView {
	id: string;
	name: string;
	valueType: ParamValueType;
	dictionaryId: string | null;
	/** ENUM: the list's name. */
	dictionaryName: string | null;
	/** Types and items that have a value of it. */
	typeCount: number;
	itemCount: number;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const valueVariants = {
	STRING: { text: z.string().trim().min(1, 'Пустое значение').max(1000) },
	NUMBER: { value: finite, unit },
	RANGE: { min: finite, max: finite, unit },
	ENUM: { optionIds: z.array(uuid).min(1, 'Выберите вариант') },
	URL: { url: z.string().trim().max(2000).refine(isHttpUrl, 'Нужна ссылка вида https://…') },
	FILE: {
		fileKey: z.string().min(1).max(500),
		fileName: z.string().min(1).max(255),
		fileMime: z.string().min(1).max(255),
		fileSize: z.number().int().min(0).max(MAX_PARAM_FILE_SIZE)
	},
	DATE: { date: z.string().refine(isIsoDate, 'Нужна дата ГГГГ-ММ-ДД') },
	REF: {
		refItemId: uuid.nullish().transform((v) => v ?? null),
		refTypeId: uuid.nullish().transform((v) => v ?? null)
	},
	BOOLEAN: { value: z.boolean() }
} as const;

/** The value of one parameter, given with the definition it belongs to. */
export const paramInputSchema = z
	.discriminatedUnion('valueType', [
		z.object({ defId: uuid, valueType: z.literal('STRING'), ...valueVariants.STRING }),
		z.object({ defId: uuid, valueType: z.literal('NUMBER'), ...valueVariants.NUMBER }),
		z.object({ defId: uuid, valueType: z.literal('RANGE'), ...valueVariants.RANGE }),
		z.object({ defId: uuid, valueType: z.literal('ENUM'), ...valueVariants.ENUM }),
		z.object({ defId: uuid, valueType: z.literal('URL'), ...valueVariants.URL }),
		z.object({ defId: uuid, valueType: z.literal('FILE'), ...valueVariants.FILE }),
		z.object({ defId: uuid, valueType: z.literal('DATE'), ...valueVariants.DATE }),
		z.object({ defId: uuid, valueType: z.literal('REF'), ...valueVariants.REF }),
		z.object({ defId: uuid, valueType: z.literal('BOOLEAN'), ...valueVariants.BOOLEAN })
	])
	.superRefine((v, ctx) => {
		if (v.valueType === 'RANGE' && v.min > v.max) {
			ctx.addIssue({ code: 'custom', message: 'Минимум больше максимума', path: ['max'] });
		}
		if (v.valueType === 'REF' && (v.refItemId === null) === (v.refTypeId === null)) {
			ctx.addIssue({ code: 'custom', message: 'Выберите вещь или тип', path: ['refItemId'] });
		}
	});

export type ParamInput = z.infer<typeof paramInputSchema>;
export type ParamValue = DistributiveOmit<ParamInput, 'defId'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A whole parameter list; each definition at most once. */
export const paramListSchema = z
	.array(paramInputSchema)
	.max(MAX_PARAMS, `Не больше ${MAX_PARAMS} параметров`)
	.superRefine((params, ctx) => {
		const seen = new Set<string>();
		params.forEach((p, i) => {
			if (seen.has(p.defId)) {
				ctx.addIssue({ code: 'custom', message: 'Параметр повторяется', path: [i, 'defId'] });
			}
			seen.add(p.defId);
		});
	});

/**
 * A stored parameter as shown to the user: the value plus what the server
 * resolved (the definition's name, enum option labels in list order, the REF
 * target).
 */
export type ParamView = ParamInput & {
	id: string;
	/** The definition's name. */
	key: string;
	/** ENUM: the drop-down list of the definition. */
	dictionaryId?: string | null;
	/** ENUM: chosen options; renaming an option shows here at once. */
	options?: { id: string; label: string }[];
	/** REF: the target, or null when it no longer exists. */
	ref?: { kind: 'item' | 'type'; id: string; name: string; archived: boolean } | null;
};

export type ParamSource = 'type' | 'item';
export type MergedParam = ParamView & { source: ParamSource };

/** Name comparison is case-insensitive and ignores surrounding spaces. */
export function normalizeParamKey(k: string): string {
	return k.trim().toLocaleLowerCase('ru');
}

/**
 * Type and item parameters as seen on the item card: an item value overrides
 * the type value of the same definition (shown at the type parameter's
 * position); the item's own extra parameters follow.
 */
export function mergeParams<T extends { defId: string }>(
	typeParams: T[],
	itemParams: T[]
): (T & { source: ParamSource })[] {
	const own = new Map(itemParams.map((p) => [p.defId, p]));
	const used = new Set<string>();
	const merged: (T & { source: ParamSource })[] = typeParams.map((p) => {
		const override = own.get(p.defId);
		if (!override) return { ...p, source: 'type' };
		used.add(p.defId);
		return { ...override, source: 'item' };
	});
	for (const p of itemParams) {
		if (!used.has(p.defId)) merged.push({ ...p, source: 'item' });
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

/** Dates are shown as stored, ISO «2027-05-01» (the same as everywhere in the app). */
export function formatDate(iso: string): string {
	return iso;
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
