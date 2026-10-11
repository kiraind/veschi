import { z } from 'zod';
import { idSchema } from '$lib/domain/id';
import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import {
	categoryInputSchema,
	categoryParamsSchema,
	categoryUpdateSchema,
	inCategories,
	missingParams,
	requiredAt,
	type CategoryRef,
	type CategoryRequirement,
	type CategorySummary,
	type ParamLevel,
	type RequiredParam
} from '$lib/domain/categories';
import { normalizeParamKey, type ParamDefView, type ParamInput } from '$lib/domain/params';
import { diffFields, type CategoryParamChange } from '$lib/domain/history';
import { categoryRef, recordEvent, typeRef } from './history';
import { defInclude, defViews } from './params';

/** Body of PUT /api/categories/[id]/params. */
export const categoryParamsBodySchema = z.object({ params: categoryParamsSchema });

/** Body of POST /api/types/[id]/categories. */
export const typeCategoryBodySchema = z.object({ categoryId: idSchema });

/** The categories of a type and everything they require. */
export interface TypeCategories {
	categories: CategoryRef[];
	requirements: CategoryRequirement[];
}

/** Categories of several types (by name), with their required parameters resolved. */
export async function categoriesOfTypes(
	typeIds: string[],
	tx: Tx = db
): Promise<Map<string, TypeCategories>> {
	const result = new Map<string, TypeCategories>(
		typeIds.map((id) => [id, { categories: [], requirements: [] }])
	);
	if (typeIds.length === 0) return result;
	const links = await tx.typeCategory.findMany({
		where: { typeId: { in: typeIds } },
		include: {
			category: { include: { params: { orderBy: { position: 'asc' }, include: { def: true } } } }
		},
		orderBy: { category: { name: 'asc' } }
	});
	const defIds = [...new Set(links.flatMap((l) => l.category.params.map((p) => p.defId)))];
	const defs = await viewsOf(defIds, tx);
	for (const { typeId, category } of links) {
		const entry = result.get(typeId);
		if (!entry) continue;
		entry.categories.push({ id: category.id, name: category.name });
		for (const p of category.params) {
			const def = defs.get(p.defId);
			if (def) {
				entry.requirements.push({
					categoryId: category.id,
					categoryName: category.name,
					def,
					level: p.level
				});
			}
		}
	}
	return result;
}

async function viewsOf(defIds: string[], tx: Tx): Promise<Map<string, ParamDefView>> {
	if (defIds.length === 0) return new Map();
	const defs = await tx.paramDef.findMany({ where: { id: { in: defIds } }, include: defInclude });
	return new Map((await defViews(defs, tx)).map((d) => [d.id, d]));
}

/**
 * A new item of this type must come with own values of every parameter its
 * categories require «у каждой вещи».
 */
export async function assertItemComplete(
	typeId: string,
	params: Pick<ParamInput, 'defId'>[],
	tx: Tx
): Promise<void> {
	const { requirements } = (await categoriesOfTypes([typeId], tx)).get(typeId)!;
	const missing = missingParams(requiredAt(requirements, 'ITEM'), params);
	if (missing.length === 0) return;
	const names = missing.map((m) => `«${m.def.name}»`).join(', ');
	const categories = [
		...new Map(missing.flatMap((m) => m.categories).map((c) => [c.id, c])).values()
	];
	throw new ValidationError(
		`Заполните ${missing.length > 1 ? 'параметры' : 'параметр'} ${names}: ${
			missing.length > 1 ? 'они обязательны' : 'он обязателен'
		} у каждой вещи ${inCategories(categories)}`
	);
}

// ---------------------------------------------------------------------------
// Categories («Категории» page)
// ---------------------------------------------------------------------------

async function findCategory(actor: Actor, id: string, tx: Tx = db) {
	const category = await tx.category.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!category) throw new NotFoundError('Категория не найдена');
	return category;
}

async function assertNameFree(actor: Actor, name: string, exceptId: string | null, tx: Tx) {
	const same = await tx.category.findMany({
		where: {
			name: { equals: name, mode: 'insensitive' },
			...visibleTo(actor),
			...(exceptId ? { id: { not: exceptId } } : {})
		},
		select: { name: true }
	});
	if (same.some((c) => normalizeParamKey(c.name) === normalizeParamKey(name))) {
		throw new ConflictError(`Категория «${name}» уже есть`);
	}
}

/** Categories sorted by name, with their required parameters and type counts. */
export async function listCategories(actor: Actor): Promise<CategorySummary[]> {
	const categories = await db.category.findMany({
		where: visibleTo(actor),
		include: {
			params: { orderBy: { position: 'asc' }, include: { def: { select: { name: true } } } },
			_count: { select: { types: true } }
		},
		orderBy: { name: 'asc' }
	});
	return categories.map((c) => ({
		id: c.id,
		name: c.name,
		description: c.description,
		params: c.params.map((p) => ({ name: p.def.name, level: p.level })),
		typeCount: c._count.types
	}));
}

/** Most incomplete items listed on a category card. */
const MAX_INCOMPLETE_ITEMS = 100;

export interface CategoryCard {
	category: { id: string; name: string; description: string | null };
	/** Required parameters in list order. */
	params: { def: ParamDefView; level: ParamLevel }[];
	/** Types in the category; `missing` — names of «у типа» parameters it has no value of. */
	types: { id: string; name: string; itemCount: number; missing: string[] }[];
	/**
	 * Active items of its types without an own value of an «у каждой вещи»
	 * parameter (at most MAX_INCOMPLETE_ITEMS; `incompleteItemCount` is all of them).
	 */
	incompleteItems: { id: string; name: string; missing: string[] }[];
	incompleteItemCount: number;
}

export async function getCategoryCard(actor: Actor, id: string): Promise<CategoryCard> {
	const category = await findCategory(actor, id);
	const [rows, links] = await Promise.all([
		db.categoryParam.findMany({ where: { categoryId: id }, orderBy: { position: 'asc' } }),
		db.typeCategory.findMany({
			where: { categoryId: id },
			include: {
				type: {
					include: {
						params: { select: { defId: true } },
						_count: { select: { items: { where: { status: 'ACTIVE' } } } }
					}
				}
			},
			orderBy: { type: { name: 'asc' } }
		})
	]);
	const defs = await viewsOf(
		rows.map((r) => r.defId),
		db
	);
	const params = rows.flatMap((r) => {
		const def = defs.get(r.defId);
		return def ? [{ def, level: r.level }] : [];
	});
	const atLevel = (level: ParamLevel) => params.filter((p) => p.level === level);
	const missingNames = (level: ParamLevel, have: { defId: string }[]) => {
		const own = new Set(have.map((h) => h.defId));
		return atLevel(level)
			.filter((p) => !own.has(p.def.id))
			.map((p) => p.def.name);
	};

	const perItem = atLevel('ITEM');
	const items =
		perItem.length && links.length
			? await db.item.findMany({
					where: {
						typeId: { in: links.map((l) => l.typeId) },
						status: 'ACTIVE',
						...visibleTo(actor),
						// Without an own value of at least one of them.
						OR: perItem.map((p) => ({ params: { none: { defId: p.def.id } } }))
					},
					include: { type: { select: { name: true } }, params: { select: { defId: true } } },
					orderBy: { createdAt: 'asc' }
				})
			: [];
	const incompleteItems = items
		.map((i) => ({ id: i.id, name: itemDisplayName(i), missing: missingNames('ITEM', i.params) }))
		.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

	return {
		category: { id: category.id, name: category.name, description: category.description },
		params,
		types: links.map(({ type }) => ({
			id: type.id,
			name: type.name,
			itemCount: type._count.items,
			missing: missingNames('TYPE', type.params)
		})),
		incompleteItems: incompleteItems.slice(0, MAX_INCOMPLETE_ITEMS),
		incompleteItemCount: incompleteItems.length
	};
}

export async function createCategory(actor: Actor, input: unknown): Promise<CategoryRef> {
	const { name, description } = categoryInputSchema.parse(input);
	return db.$transaction(async (tx) => {
		await assertNameFree(actor, name, null, tx);
		const category = await tx.category.create({
			data: { name, description, ...ownedBy(actor) }
		});
		await recordEvent(tx, actor, {
			kind: 'category.created',
			subject: categoryRef(category),
			data: {}
		});
		return { id: category.id, name: category.name };
	});
}

/** Renames a category or changes its description. */
export async function updateCategory(actor: Actor, id: string, input: unknown): Promise<void> {
	const { name, description } = categoryUpdateSchema.parse(input);
	await db.$transaction(async (tx) => {
		const category = await findCategory(actor, id, tx);
		if (name !== undefined) await assertNameFree(actor, name, id, tx);
		const updated = await tx.category.update({ where: { id }, data: { name, description } });
		const changes = diffFields(
			{ name: category.name, description: category.description },
			{ name, description }
		);
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'category.updated',
				subject: categoryRef(updated),
				data: { changes }
			});
		}
	});
}

/** Deletes a category: its types stay, without its requirements. */
export async function deleteCategory(actor: Actor, id: string): Promise<void> {
	await db.$transaction(async (tx) => {
		const category = await findCategory(actor, id, tx);
		const types = await tx.typeCategory.count({ where: { categoryId: id } });
		await recordEvent(tx, actor, {
			kind: 'category.deleted',
			subject: categoryRef(category),
			data: types ? { types } : {}
		});
		await tx.category.delete({ where: { id } });
	});
}

/**
 * Replaces the list of required parameters of a category: which parameters
 * and where each must have its value. Values that are missing after this are
 * not an error — types and items show them as «не заполнено».
 */
export async function setCategoryParams(
	actor: Actor,
	id: string,
	input: unknown
): Promise<CategoryCard> {
	const list = categoryParamsSchema.parse(input);
	await db.$transaction(async (tx) => {
		const category = await findCategory(actor, id, tx);
		const defs = await tx.paramDef.findMany({
			where: { id: { in: list.map((p) => p.defId) }, ...visibleTo(actor) },
			select: { id: true, name: true }
		});
		const names = new Map(defs.map((d) => [d.id, d.name]));
		if (list.some((p) => !names.has(p.defId))) throw new ValidationError('Параметр не найден');

		const before = await tx.categoryParam.findMany({
			where: { categoryId: id },
			include: { def: { select: { name: true } } }
		});
		await tx.categoryParam.deleteMany({ where: { categoryId: id } });
		await tx.categoryParam.createMany({
			data: list.map((p, position) => ({
				categoryId: id,
				defId: p.defId,
				level: p.level,
				position
			}))
		});

		const old = new Map(before.map((b) => [b.defId, b]));
		const now = new Set(list.map((p) => p.defId));
		const changes: CategoryParamChange[] = [];
		for (const p of list) {
			const was = old.get(p.defId);
			const name = names.get(p.defId)!;
			if (!was) changes.push({ name, change: 'added', level: p.level });
			else if (was.level !== p.level) changes.push({ name, change: 'level', level: p.level });
		}
		for (const b of before) {
			if (!now.has(b.defId)) changes.push({ name: b.def.name, change: 'removed', level: b.level });
		}
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'category.params',
				subject: categoryRef(category),
				data: { changes },
				refIds: [...new Set([...list.map((p) => p.defId), ...before.map((b) => b.defId)])]
			});
		}
	});
	return getCategoryCard(actor, id);
}

async function findType(actor: Actor, id: string, tx: Tx) {
	const type = await tx.itemType.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	return type;
}

/**
 * Puts a type into a category. Values the category requires and the type or
 * its items lack are not filled here: the cards show them as «не заполнено».
 */
export async function addTypeToCategory(
	actor: Actor,
	typeId: string,
	categoryId: string,
	tx?: Tx
): Promise<void> {
	if (!tx) return db.$transaction((t) => addTypeToCategory(actor, typeId, categoryId, t));
	const type = await findType(actor, typeId, tx);
	const category = await findCategory(actor, categoryId, tx);
	const existing = await tx.typeCategory.findUnique({
		where: { typeId_categoryId: { typeId, categoryId } }
	});
	if (existing) return;
	await tx.typeCategory.create({ data: { typeId, categoryId } });
	await recordEvent(tx, actor, {
		kind: 'type.category',
		subject: typeRef(type),
		data: {
			category: { id: category.id, name: category.name, kind: 'category' },
			removed: false
		},
		refIds: [category.id]
	});
}

export async function removeTypeFromCategory(
	actor: Actor,
	typeId: string,
	categoryId: string
): Promise<void> {
	await db.$transaction(async (tx) => {
		const type = await findType(actor, typeId, tx);
		const category = await findCategory(actor, categoryId, tx);
		const { count } = await tx.typeCategory.deleteMany({ where: { typeId, categoryId } });
		if (count === 0) return;
		await recordEvent(tx, actor, {
			kind: 'type.category',
			subject: typeRef(type),
			data: { category: { id: category.id, name: category.name, kind: 'category' }, removed: true },
			refIds: [category.id]
		});
	});
}

/** What the type and item cards show about categories. */
export interface CategoryInfo {
	categories: CategoryRef[];
	/** Required «у типа». */
	typeRequired: RequiredParam[];
	/** Required «у каждой вещи». */
	itemRequired: RequiredParam[];
}

export async function categoryInfoOf(typeId: string, tx: Tx = db): Promise<CategoryInfo> {
	const { categories, requirements } = (await categoriesOfTypes([typeId], tx)).get(typeId)!;
	return {
		categories,
		typeRequired: requiredAt(requirements, 'TYPE'),
		itemRequired: requiredAt(requirements, 'ITEM')
	};
}
