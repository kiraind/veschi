/**
 * Categories («Категории»): a category lists parameters a type in it must
 * have filled — once for the whole type (КБЖУ of «Еда») or on every item
 * (срок годности). A type may be in several categories; their requirements
 * add up. Input validation and how requirements combine. Pure functions,
 * shared by the server and the browser.
 */
import { z } from 'zod';
import { idSchema } from './id';
import type { ParamDefView } from './params';

export const PARAM_LEVELS = ['TYPE', 'ITEM'] as const;

/** Where a required parameter must have its value. */
export type ParamLevel = (typeof PARAM_LEVELS)[number];

/** How a level reads in a sentence: «Срок годности — у каждой вещи». */
export const PARAM_LEVEL_LABELS: Record<ParamLevel, string> = {
	TYPE: 'у типа',
	ITEM: 'у каждой вещи'
};

const MAX_CATEGORY_PARAMS = 100;

export const categoryNameSchema = z
	.string()
	.trim()
	.min(1, 'Укажите название категории')
	.max(100, 'Название длиннее 100 символов');

export const categoryDescriptionSchema = z
	.string()
	.trim()
	.max(2000, 'Описание длиннее 2000 символов')
	.nullish()
	.transform((v) => v || null);

export const categoryInputSchema = z.object({
	name: categoryNameSchema,
	description: categoryDescriptionSchema.optional()
});

/** Changes of a category: omitted fields stay as they are. */
export const categoryUpdateSchema = categoryInputSchema.partial();

/** The whole list of required parameters of a category, in order; each parameter once. */
export const categoryParamsSchema = z
	.array(z.object({ defId: idSchema, level: z.enum(PARAM_LEVELS) }))
	.max(MAX_CATEGORY_PARAMS, `Не больше ${MAX_CATEGORY_PARAMS} параметров`)
	.superRefine((list, ctx) => {
		const seen = new Set<string>();
		list.forEach((p, i) => {
			if (seen.has(p.defId)) {
				ctx.addIssue({ code: 'custom', message: 'Параметр повторяется', path: [i, 'defId'] });
			}
			seen.add(p.defId);
		});
	});

export type CategoryParamInput = z.infer<typeof categoryParamsSchema>[number];

export interface CategoryRef {
	id: string;
	name: string;
}

/** A category as listed on the «Категории» page and in pickers. */
export interface CategorySummary extends CategoryRef {
	description: string | null;
	/** Required parameter names in list order, with their level. */
	params: { name: string; level: ParamLevel }[];
	typeCount: number;
}

/** One requirement of one category. */
export interface CategoryRequirement {
	categoryId: string;
	categoryName: string;
	def: ParamDefView;
	level: ParamLevel;
}

/**
 * A parameter a type or an item must have a value of, with every category
 * that requires it at this level.
 */
export interface RequiredParam {
	def: ParamDefView;
	level: ParamLevel;
	categories: CategoryRef[];
}

/**
 * Requirements of several categories at one level, merged by parameter
 * (first occurrence keeps its place). The same parameter may be required on
 * the type by one category and on each item by another: then both apply.
 */
export function requiredAt(
	requirements: CategoryRequirement[],
	level: ParamLevel
): RequiredParam[] {
	const byDef = new Map<string, RequiredParam>();
	for (const r of requirements) {
		if (r.level !== level) continue;
		const found = byDef.get(r.def.id);
		const category = { id: r.categoryId, name: r.categoryName };
		if (found) {
			if (!found.categories.some((c) => c.id === category.id)) found.categories.push(category);
		} else {
			byDef.set(r.def.id, { def: r.def, level, categories: [category] });
		}
	}
	return [...byDef.values()];
}

/** Required parameters the list has no value of. */
export function missingParams(
	required: RequiredParam[],
	values: { defId: string }[]
): RequiredParam[] {
	const have = new Set(values.map((v) => v.defId));
	return required.filter((r) => !have.has(r.def.id));
}

/** «Еда», «Еда и Хрупкое», «Еда, Хрупкое и Химия» — for «обязателен в категории …». */
export function categoryNames(categories: CategoryRef[]): string {
	const names = categories.map((c) => `«${c.name}»`);
	if (names.length <= 1) return names.join('');
	return `${names.slice(0, -1).join(', ')} и ${names.at(-1)}`;
}

/** «в категории «Еда»», «в категориях «Еда» и «Хрупкое»». */
export function inCategories(categories: CategoryRef[]): string {
	return `в ${categories.length > 1 ? 'категориях' : 'категории'} ${categoryNames(categories)}`;
}
