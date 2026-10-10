import type { Param, ParamDef, ParamEnumValue, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import {
	PARAM_VALUE_TYPE_LABELS,
	hasUnit,
	normalizeParamKey,
	paramDefInputSchema,
	paramInputSchema,
	paramListSchema,
	type ParamDefView,
	type ParamInput,
	type ParamView
} from '$lib/domain/params';
import { createOptionList, updateOptionList } from './dictionaries';
import { deleteUnreferencedFiles, isOwnUpload } from './files';

/** Body of the PUT …/params endpoints. */
export const paramsBodySchema = z.object({ params: paramListSchema });

/** Whose parameter list: a type's (shared by its items) or one item's. */
export type ParamTarget = { typeId: string } | { itemId: string };

type ParamRow = Param & { enumValues: ParamEnumValue[]; def: ParamDef };

function targetWhere(target: ParamTarget) {
	return 'typeId' in target ? { typeId: target.typeId } : { itemId: target.itemId };
}

async function assertTargetVisible(actor: Actor, target: ParamTarget, tx: Tx): Promise<void> {
	const found =
		'typeId' in target
			? await tx.itemType.findFirst({ where: { id: target.typeId, ...visibleTo(actor) } })
			: await tx.item.findFirst({ where: { id: target.itemId, ...visibleTo(actor) } });
	if (!found) throw new NotFoundError('typeId' in target ? 'Тип не найден' : 'Вещь не найдена');
}

/** Value columns of a Param row for one input. */
function toColumns(
	p: ParamInput
): Omit<Prisma.ParamUncheckedCreateInput, 'defId' | 'dictionaryId' | 'position'> {
	switch (p.valueType) {
		case 'STRING':
			return { valueType: p.valueType, textValue: p.text };
		case 'NUMBER':
			return { valueType: p.valueType, numberValue: p.value };
		case 'RANGE':
			return { valueType: p.valueType, numberValue: p.min, numberMax: p.max };
		case 'ENUM':
			return { valueType: p.valueType };
		case 'URL':
			return { valueType: p.valueType, textValue: p.url };
		case 'FILE':
			return {
				valueType: p.valueType,
				fileKey: p.fileKey,
				fileName: p.fileName,
				fileMime: p.fileMime,
				fileSize: p.fileSize
			};
		case 'DATE':
			return { valueType: p.valueType, dateValue: new Date(`${p.date}T00:00:00Z`) };
		case 'REF':
			return { valueType: p.valueType, refItemId: p.refItemId, refTypeId: p.refTypeId };
		case 'BOOLEAN':
			return { valueType: p.valueType, boolValue: p.value };
	}
}

function fromRow(row: ParamRow): ParamInput {
	const base = { defId: row.defId };
	switch (row.valueType) {
		case 'STRING':
			return { ...base, valueType: 'STRING', text: row.textValue ?? '' };
		case 'NUMBER':
			return { ...base, valueType: 'NUMBER', value: row.numberValue ?? 0 };
		case 'RANGE':
			return {
				...base,
				valueType: 'RANGE',
				min: row.numberValue ?? 0,
				max: row.numberMax ?? 0
			};
		case 'ENUM':
			return {
				...base,
				valueType: 'ENUM',
				optionIds: row.enumValues.map((v) => v.optionId)
			};
		case 'URL':
			return { ...base, valueType: 'URL', url: row.textValue ?? '' };
		case 'FILE':
			return {
				...base,
				valueType: 'FILE',
				fileKey: row.fileKey ?? '',
				fileName: row.fileName ?? '',
				fileMime: row.fileMime ?? 'application/octet-stream',
				fileSize: row.fileSize ?? 0
			};
		case 'DATE':
			return { ...base, valueType: 'DATE', date: row.dateValue?.toISOString().slice(0, 10) ?? '' };
		case 'REF':
			return { ...base, valueType: 'REF', refItemId: row.refItemId, refTypeId: row.refTypeId };
		case 'BOOLEAN':
			return { ...base, valueType: 'BOOLEAN', value: row.boolValue ?? false };
	}
}

/**
 * Stored parameters → views: units, enum options (current labels, list order)
 * and REF targets (name, archived mark) are resolved in two batched queries.
 */
async function toViews(actor: Actor, rows: ParamRow[], tx: Tx): Promise<ParamView[]> {
	const optionIds = rows.flatMap((r) => r.enumValues.map((v) => v.optionId));
	const refItemIds = rows.flatMap((r) => (r.refItemId ? [r.refItemId] : []));
	const refTypeIds = rows.flatMap((r) => (r.refTypeId ? [r.refTypeId] : []));
	const [options, refItems, refTypes] = await Promise.all([
		optionIds.length
			? tx.enumOption.findMany({ where: { id: { in: optionIds } }, orderBy: { position: 'asc' } })
			: [],
		refItemIds.length
			? tx.item.findMany({
					where: { id: { in: refItemIds }, ...visibleTo(actor) },
					include: { type: { select: { name: true } } }
				})
			: [],
		refTypeIds.length
			? tx.itemType.findMany({ where: { id: { in: refTypeIds }, ...visibleTo(actor) } })
			: []
	]);
	const itemsById = new Map(refItems.map((i) => [i.id, i]));
	const typesById = new Map(refTypes.map((t) => [t.id, t]));

	return rows.map((row) => {
		const view: ParamView = { ...fromRow(row), id: row.id, key: row.def.name };
		if (hasUnit(view.valueType)) view.unit = row.def.unit;
		if (view.valueType === 'ENUM') {
			const chosen = new Set(view.optionIds);
			view.options = options
				.filter((o) => chosen.has(o.id))
				.map((o) => ({ id: o.id, label: o.label }));
			view.optionIds = view.options.map((o) => o.id);
		}
		if (view.valueType === 'REF') {
			const item = row.refItemId ? itemsById.get(row.refItemId) : undefined;
			const type = row.refTypeId ? typesById.get(row.refTypeId) : undefined;
			view.ref = item
				? {
						kind: 'item',
						id: item.id,
						name: itemDisplayName(item),
						archived: item.status === 'ARCHIVED'
					}
				: type
					? { kind: 'type', id: type.id, name: type.name, archived: false }
					: null;
		}
		return view;
	});
}

/** Parameters of several targets of one kind, keyed by target id, each in list order. */
export async function getParamsOf(
	actor: Actor,
	kind: 'typeId' | 'itemId',
	ids: string[],
	tx: Tx = db
): Promise<Map<string, ParamView[]>> {
	const result = new Map<string, ParamView[]>(ids.map((id) => [id, []]));
	if (ids.length === 0) return result;
	const rows = await tx.param.findMany({
		where: { [kind]: { in: ids } },
		include: { enumValues: true, def: true },
		orderBy: { position: 'asc' }
	});
	const views = await toViews(actor, rows, tx);
	views.forEach((view, i) => result.get(rows[i]?.[kind] ?? '')?.push(view));
	return result;
}

/** The parameter list of a type or an item. */
export async function listParams(
	actor: Actor,
	target: ParamTarget,
	tx: Tx = db
): Promise<ParamView[]> {
	await assertTargetVisible(actor, target, tx);
	const [kind, id] =
		'typeId' in target
			? (['typeId', target.typeId] as const)
			: (['itemId', target.itemId] as const);
	return (await getParamsOf(actor, kind, [id], tx)).get(id) ?? [];
}

/** Visible definitions by id; a missing one is an error. */
async function findDefs(actor: Actor, ids: string[], tx: Tx): Promise<Map<string, ParamDef>> {
	const defs = await tx.paramDef.findMany({ where: { id: { in: ids }, ...visibleTo(actor) } });
	const byId = new Map(defs.map((d) => [d.id, d]));
	if (ids.some((id) => !byId.has(id))) throw new ValidationError('Параметр не найден');
	return byId;
}

/**
 * Checks one value against its definition and the references inside it:
 * value type, drop-down options, REF targets, uploaded files.
 */
async function assertValueValid(actor: Actor, def: ParamDef, p: ParamInput, tx: Tx): Promise<void> {
	if (p.valueType !== def.valueType) {
		throw new ValidationError(
			`«${def.name}»: нужно значение типа «${PARAM_VALUE_TYPE_LABELS[def.valueType]}»`
		);
	}
	if (p.valueType === 'ENUM') {
		const dictionary = await tx.enumDictionary.findFirst({
			where: { id: def.dictionaryId ?? '', ...visibleTo(actor) },
			include: { options: { select: { id: true } } }
		});
		if (!dictionary) throw new ValidationError(`«${def.name}»: выпадающий список не найден`);
		const known = new Set(dictionary.options.map((o) => o.id));
		if (!p.optionIds.every((id) => known.has(id))) {
			throw new ValidationError(`«${def.name}»: такого варианта нет в списке`);
		}
		if (!dictionary.multiple && new Set(p.optionIds).size > 1) {
			throw new ValidationError(`«${def.name}»: можно выбрать только один вариант`);
		}
	}
	if (p.valueType === 'REF') {
		const found = p.refItemId
			? await tx.item.findFirst({
					where: { id: p.refItemId, isWorkbench: false, ...visibleTo(actor) }
				})
			: await tx.itemType.findFirst({ where: { id: p.refTypeId ?? '', ...visibleTo(actor) } });
		if (!found) throw new ValidationError(`«${def.name}»: вещь или тип не найдены`);
	}
	if (p.valueType === 'FILE' && !isOwnUpload(actor, p.fileKey)) {
		const known = await tx.param.findFirst({
			where: {
				fileKey: p.fileKey,
				OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }]
			}
		});
		if (!known) throw new ValidationError(`«${def.name}»: файл не найден, загрузите его заново`);
	}
}

/** Row data of a value: value columns plus the definition's type and list. */
function rowData(def: ParamDef, p: ParamInput) {
	return { ...toColumns(p), defId: def.id, dictionaryId: def.dictionaryId };
}

function enumValues(p: ParamInput) {
	return p.valueType === 'ENUM'
		? { create: [...new Set(p.optionIds)].map((optionId) => ({ optionId })) }
		: undefined;
}

/**
 * Replaces the whole parameter list of a target inside a transaction.
 * Returns file keys the target no longer uses (to delete after commit).
 */
export async function replaceParams(
	actor: Actor,
	target: ParamTarget,
	inputs: unknown,
	tx: Tx
): Promise<string[]> {
	const params = paramListSchema.parse(inputs);
	await assertTargetVisible(actor, target, tx);
	const defs = await findDefs(
		actor,
		params.map((p) => p.defId),
		tx
	);
	for (const p of params) await assertValueValid(actor, defs.get(p.defId)!, p, tx);

	const where = targetWhere(target);
	const old = await tx.param.findMany({ where, select: { fileKey: true } });
	await tx.param.deleteMany({ where });
	for (const [position, p] of params.entries()) {
		await tx.param.create({
			data: { ...where, ...rowData(defs.get(p.defId)!, p), position, enumValues: enumValues(p) }
		});
	}
	const kept = new Set(params.flatMap((p) => (p.valueType === 'FILE' ? [p.fileKey] : [])));
	return old.flatMap((r) => (r.fileKey && !kept.has(r.fileKey) ? [r.fileKey] : []));
}

/** Replaces the whole parameter list of a type or an item in one call. */
export async function setParams(
	actor: Actor,
	target: ParamTarget,
	inputs: unknown
): Promise<ParamView[]> {
	const dropped = await db.$transaction((tx) => replaceParams(actor, target, inputs, tx));
	await deleteUnreferencedFiles(dropped);
	return listParams(actor, target);
}

/** Adds the value of one more parameter at the end of a type's or an item's list. */
export async function addParam(
	actor: Actor,
	target: ParamTarget,
	input: unknown
): Promise<ParamView> {
	const p = paramInputSchema.parse(input);
	const id = await db.$transaction(async (tx) => {
		await assertTargetVisible(actor, target, tx);
		const def = (await findDefs(actor, [p.defId], tx)).get(p.defId)!;
		await assertValueValid(actor, def, p, tx);
		const where = targetWhere(target);
		if (await tx.param.findFirst({ where: { ...where, defId: def.id } })) {
			throw new ConflictError(`Параметр «${def.name}» уже есть — измените его значение`);
		}
		const last = await tx.param.aggregate({ where, _max: { position: true } });
		const row = await tx.param.create({
			data: {
				...where,
				...rowData(def, p),
				position: (last._max.position ?? -1) + 1,
				enumValues: enumValues(p)
			}
		});
		return row.id;
	});
	return getParam(actor, id);
}

/** A stored value the actor can see (through its type or item). */
async function findParam(actor: Actor, id: string, tx: Tx = db) {
	const param = await tx.param.findFirst({
		where: { id, OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }] },
		include: { def: true }
	});
	if (!param) throw new NotFoundError('Параметр не найден');
	return param;
}

export async function getParam(actor: Actor, id: string, tx: Tx = db): Promise<ParamView> {
	const row = await tx.param.findFirstOrThrow({
		where: { id: (await findParam(actor, id, tx)).id },
		include: { enumValues: true, def: true }
	});
	return (await toViews(actor, [row], tx))[0]!;
}

/** Changes a stored value; its parameter stays the same. */
export async function updateParam(actor: Actor, id: string, input: unknown): Promise<ParamView> {
	const p = paramInputSchema.parse(input);
	const dropped = await db.$transaction(async (tx) => {
		const param = await findParam(actor, id, tx);
		if (p.defId !== param.defId) throw new ValidationError('Параметр значения менять нельзя');
		await assertValueValid(actor, param.def, p, tx);
		await tx.paramEnumValue.deleteMany({ where: { paramId: id } });
		const cleared = {
			textValue: null,
			numberValue: null,
			numberMax: null,
			dateValue: null,
			boolValue: null,
			fileKey: null,
			fileName: null,
			fileMime: null,
			fileSize: null,
			refItemId: null,
			refTypeId: null
		};
		await tx.param.update({
			where: { id },
			data: { ...cleared, ...rowData(param.def, p), enumValues: enumValues(p) }
		});
		const keep = p.valueType === 'FILE' ? p.fileKey : null;
		return param.fileKey && param.fileKey !== keep ? [param.fileKey] : [];
	});
	await deleteUnreferencedFiles(dropped);
	return getParam(actor, id);
}

export async function deleteParam(actor: Actor, id: string): Promise<void> {
	const param = await findParam(actor, id);
	await db.param.delete({ where: { id } });
	if (param.fileKey) await deleteUnreferencedFiles([param.fileKey]);
}

/** Moves a value one place up (-1) or down (+1) in its list. */
export async function moveParam(actor: Actor, id: string, delta: -1 | 1): Promise<void> {
	await db.$transaction(async (tx) => {
		const param = await findParam(actor, id, tx);
		const where = param.typeId ? { typeId: param.typeId } : { itemId: param.itemId };
		const list = await tx.param.findMany({
			where,
			orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
			select: { id: true }
		});
		const from = list.findIndex((r) => r.id === id);
		const to = from + delta;
		if (to < 0 || to >= list.length) return;
		[list[from], list[to]] = [list[to]!, list[from]!];
		for (const [position, row] of list.entries()) {
			await tx.param.update({ where: { id: row.id }, data: { position } });
		}
	});
}

// ---------------------------------------------------------------------------
// Definitions («Параметры»)
// ---------------------------------------------------------------------------

const defInclude = {
	dictionary: {
		include: {
			options: {
				orderBy: { position: 'asc' },
				include: { _count: { select: { values: true } } }
			}
		}
	}
} satisfies Prisma.ParamDefInclude;

async function defViews(
	defs: Prisma.ParamDefGetPayload<{ include: typeof defInclude }>[],
	tx: Tx
): Promise<ParamDefView[]> {
	const counts = defs.length
		? await tx.param.groupBy({
				by: ['defId'],
				where: { defId: { in: defs.map((d) => d.id) } },
				_count: { typeId: true, itemId: true }
			})
		: [];
	const byDef = new Map(counts.map((c) => [c.defId, c._count]));
	return defs.map((d) => ({
		id: d.id,
		name: d.name,
		valueType: d.valueType,
		unit: d.unit,
		multiple: d.dictionary?.multiple ?? false,
		options: (d.dictionary?.options ?? []).map((o) => ({
			id: o.id,
			label: o.label,
			usage: o._count.values
		})),
		typeCount: byDef.get(d.id)?.typeId ?? 0,
		itemCount: byDef.get(d.id)?.itemId ?? 0
	}));
}

/** Parameter definitions sorted by name, with usage counts. */
export async function listParamDefs(actor: Actor): Promise<ParamDefView[]> {
	const defs = await db.paramDef.findMany({
		where: visibleTo(actor),
		include: defInclude,
		orderBy: { name: 'asc' }
	});
	return defViews(defs, db);
}

async function findDef(actor: Actor, id: string, tx: Tx = db) {
	const def = await tx.paramDef.findFirst({
		where: { id, ...visibleTo(actor) },
		include: defInclude
	});
	if (!def) throw new NotFoundError('Параметр не найден');
	return def;
}

export interface ParamDefCard {
	def: ParamDefView;
	/** Where it has values. */
	types: { id: string; name: string }[];
	items: { id: string; name: string; archived: boolean }[];
}

export async function getParamDef(actor: Actor, id: string): Promise<ParamDefCard> {
	const def = await findDef(actor, id);
	const values = await db.param.findMany({
		where: { defId: id },
		include: {
			type: { select: { id: true, name: true } },
			item: { include: { type: { select: { name: true } } } }
		}
	});
	const collator = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru');
	return {
		def: (await defViews([def], db))[0]!,
		types: values.flatMap((v) => (v.type ? [v.type] : [])).sort(collator),
		items: values
			.flatMap((v) =>
				v.item
					? [
							{
								id: v.item.id,
								name: itemDisplayName(v.item),
								archived: v.item.status === 'ARCHIVED'
							}
						]
					: []
			)
			.sort(collator)
	};
}

async function assertNameFree(actor: Actor, name: string, exceptId: string | null, tx: Tx) {
	const same = await tx.paramDef.findMany({
		where: {
			name: { equals: name, mode: 'insensitive' },
			...visibleTo(actor),
			...(exceptId ? { id: { not: exceptId } } : {})
		},
		select: { name: true }
	});
	if (same.some((d) => normalizeParamKey(d.name) === normalizeParamKey(name))) {
		throw new ConflictError(`Параметр «${name}» уже есть`);
	}
}

export async function createParamDef(actor: Actor, input: unknown): Promise<ParamDefView> {
	const { options, multiple, ...data } = paramDefInputSchema.parse(input);
	if (options.some((o) => o.id)) throw new ValidationError('У новых вариантов не бывает id');
	const id = await db.$transaction(async (tx) => {
		await assertNameFree(actor, data.name, null, tx);
		const dictionaryId =
			data.valueType === 'ENUM'
				? await createOptionList(actor, { name: data.name, multiple, options }, tx)
				: null;
		return (await tx.paramDef.create({ data: { ...data, dictionaryId, ...ownedBy(actor) } })).id;
	});
	return (await getParamDef(actor, id)).def;
}

/**
 * Renames a definition (every value shows the new name at once), changes its
 * unit or its drop-down options. The value type can change only while no
 * type or item has a value.
 */
export async function updateParamDef(
	actor: Actor,
	id: string,
	input: unknown
): Promise<ParamDefView> {
	const { options, multiple, ...data } = paramDefInputSchema.parse(input);
	await db.$transaction(async (tx) => {
		const def = await findDef(actor, id, tx);
		await assertNameFree(actor, data.name, id, tx);
		if (data.valueType !== def.valueType && (await tx.param.count({ where: { defId: id } }))) {
			throw new ConflictError('Тип значения можно поменять, только пока у параметра нет значений');
		}
		let dictionaryId = def.dictionaryId;
		if (data.valueType === 'ENUM') {
			if (dictionaryId) {
				await updateOptionList(dictionaryId, { name: data.name, multiple, options }, tx);
			} else {
				if (options.some((o) => o.id)) throw new ValidationError('Вариант не из этого списка');
				dictionaryId = await createOptionList(actor, { name: data.name, multiple, options }, tx);
			}
		} else {
			dictionaryId = null;
		}
		await tx.paramDef.update({ where: { id }, data: { ...data, dictionaryId } });
		if (def.dictionaryId && !dictionaryId) {
			await tx.enumDictionary.delete({ where: { id: def.dictionaryId } });
		}
	});
	return (await getParamDef(actor, id)).def;
}

/** Deletes a definition no type or item has a value of (with its options). */
export async function deleteParamDef(actor: Actor, id: string): Promise<void> {
	await db.$transaction(async (tx) => {
		const def = await findDef(actor, id, tx);
		const used = await tx.param.count({ where: { defId: id } });
		if (used > 0) {
			throw new ConflictError(
				`Параметр задан у типов и вещей (${used}) — сначала удалите значения`
			);
		}
		await tx.paramDef.delete({ where: { id } });
		if (def.dictionaryId) await tx.enumDictionary.delete({ where: { id: def.dictionaryId } });
	});
}
