import type { Param, ParamDef, ParamEnumValue, ParamRef, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import {
	LINK_HOLDER_LABELS,
	MAX_LINK_TARGETS,
	MAX_PARAMS,
	PARAM_VALUE_TYPE_LABELS,
	hasUnit,
	isLink,
	isSymmetric,
	paramDefInputSchema,
	paramInputSchema,
	paramListSchema,
	type LinkKind,
	type ParamDefView,
	type ParamInput,
	type ParamView
} from '$lib/domain/params';
import { diffFields, type ParamChange } from '$lib/domain/history';
import { inCategories, type CategoryRef, type ParamLevel } from '$lib/domain/categories';
import { createOptionList, updateOptionList } from './dictionaries';
import { deleteUnreferencedFiles, isOwnUpload } from './files';
import { itemSubject, paramDefRef, recordEvent, typeRef } from './history';
import { assertNameFree } from './names';

/** Body of the PUT …/params endpoints. */
export const paramsBodySchema = z.object({ params: paramListSchema });

/** Whose parameter list: a type's (shared by its items) or one item's. */
export type ParamTarget = { typeId: string } | { itemId: string };

type ParamRow = Param & { enumValues: ParamEnumValue[]; refs: ParamRef[]; def: ParamDef };

/** A definition with its inverse (links). */
type DefRow = ParamDef & { inverse: ParamDef | null };

function targetWhere(target: ParamTarget) {
	return 'typeId' in target ? { typeId: target.typeId } : { itemId: target.itemId };
}

/** Is the target a type or an item. */
function kindOf(target: ParamTarget): LinkKind {
	return 'typeId' in target ? 'TYPE' : 'ITEM';
}

function idOf(target: ParamTarget): string {
	return 'typeId' in target ? target.typeId : target.itemId;
}

/** The type or item a link of this kind points at. */
function linkTarget(kind: LinkKind, id: string): ParamTarget {
	return kind === 'TYPE' ? { typeId: id } : { itemId: id };
}

/** Id of a link target row. */
function refId(r: Pick<ParamRef, 'itemId' | 'typeId'>): string {
	return r.itemId ?? r.typeId ?? '';
}

/** Name of a type or an item for messages. */
async function targetName(target: ParamTarget, tx: Tx): Promise<string> {
	return 'typeId' in target
		? (await tx.itemType.findUniqueOrThrow({ where: { id: target.typeId } })).name
		: itemDisplayName(
				await tx.item.findUniqueOrThrow({
					where: { id: target.itemId },
					include: { type: { select: { name: true } } }
				})
			);
}

/** Values change only at a type or an active ordinary item (not in the archive, not a workbench). */
async function assertTargetEditable(actor: Actor, target: ParamTarget, tx: Tx): Promise<void> {
	await assertTargetVisible(actor, target, tx);
	if ('itemId' in target) await assertItemEditable(target.itemId, tx);
}

async function assertItemEditable(itemId: string, tx: Tx): Promise<void> {
	const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
	if (item.isWorkbench) throw new ValidationError('У рабочего стола нет параметров');
	if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
}

async function assertTargetVisible(actor: Actor, target: ParamTarget, tx: Tx): Promise<void> {
	const found =
		'typeId' in target
			? await tx.itemType.findFirst({ where: { id: target.typeId, ...visibleTo(actor) } })
			: await tx.item.findFirst({ where: { id: target.itemId, ...visibleTo(actor) } });
	if (!found) throw new NotFoundError('typeId' in target ? 'Тип не найден' : 'Вещь не найдена');
}

type RefCols = { itemId: string | null; typeId: string | null };

/** Stored value of a row as a comparable string (to tell changed values in the history). */
export function valueSignature(
	r: Param & { enumValues: { optionId: string }[]; refs: RefCols[] }
): string {
	return JSON.stringify([
		r.textValue,
		r.numberValue,
		r.numberMax,
		r.dateValue?.toISOString() ?? null,
		r.boolValue,
		r.fileKey,
		r.fileName,
		r.enumValues.map((v) => v.optionId).sort(),
		r.refs.map(refId).sort()
	]);
}

type SignedRow = Param & {
	enumValues: { optionId: string }[];
	refs: RefCols[];
	def: { name: string };
};

function signedRows(target: ParamTarget, tx: Tx): Promise<SignedRow[]> {
	return tx.param.findMany({
		where: targetWhere(target),
		include: {
			enumValues: { select: { optionId: true } },
			refs: { select: { itemId: true, typeId: true } },
			def: { select: { name: true } }
		}
	});
}

/** Link targets of a holder's values, by definition. */
function linksOf(rows: { defId: string; refs: RefCols[] }[]): Map<string, Set<string>> {
	return new Map(
		rows.filter((r) => r.refs.length > 0).map((r) => [r.defId, new Set(r.refs.map(refId))])
	);
}

/**
 * Keeps links two-way: `holder` now points through each link definition at
 * `after` instead of `before` (by definition id), so every newly pointed-at
 * type or item gets `holder` in its inverse value (created at the end of its
 * list when missing), and every one no longer pointed at loses it (an
 * inverse value left without targets is deleted, even when a category
 * requires it: such a gap shows as «не заполнено»). An inverse value is held
 * to the same limits as one the user saves (MAX_LINK_TARGETS targets,
 * MAX_PARAMS values), otherwise it could not be saved later: past them the
 * change is refused. With an actor the changes of each touched type or item
 * go to the history.
 */
async function syncMirrors(
	actor: Actor | null,
	holder: ParamTarget,
	before: Map<string, Set<string>>,
	after: Map<string, Set<string>>,
	tx: Tx
): Promise<void> {
	const defIds = [...new Set([...before.keys(), ...after.keys()])];
	if (defIds.length === 0) return;
	const defs = await tx.paramDef.findMany({
		where: { id: { in: defIds } },
		include: { inverse: true }
	});
	const touched = new Map<string, { target: ParamTarget; before: SignedRow[] }>();
	const back = kindOf(holder) === 'TYPE' ? { typeId: idOf(holder) } : { itemId: idOf(holder) };
	for (const def of defs) {
		const inverse = def.inverse;
		if (!inverse || !isLink(def.valueType)) continue;
		const was = before.get(def.id) ?? new Set<string>();
		const now = after.get(def.id) ?? new Set<string>();
		const changes = [
			...[...now].filter((id) => !was.has(id)).map((id) => [id, true] as const),
			...[...was].filter((id) => !now.has(id)).map((id) => [id, false] as const)
		];
		for (const [id, add] of changes) {
			const mirror = linkTarget(def.valueType, id);
			const key = `${kindOf(mirror)}:${id}`;
			if (!touched.has(key))
				touched.set(key, { target: mirror, before: await signedRows(mirror, tx) });
			const where = { ...targetWhere(mirror), defId: inverse.id };
			const value = await tx.param.findFirst({ where, include: { refs: true } });
			if (add && !value) {
				const last = await tx.param.aggregate({
					where: targetWhere(mirror),
					_max: { position: true },
					_count: true
				});
				if (last._count >= MAX_PARAMS) {
					throw new ConflictError(
						`«${await targetName(mirror, tx)}»: уже ${MAX_PARAMS} параметров, «${inverse.name}» не добавить`
					);
				}
				await tx.param.create({
					data: {
						...where,
						valueType: inverse.valueType,
						position: (last._max.position ?? -1) + 1,
						refs: { create: [back] }
					}
				});
			} else if (add && value) {
				if (!value.refs.some((r) => refId(r) === idOf(holder))) {
					if (value.refs.length >= MAX_LINK_TARGETS) {
						throw new ConflictError(
							`«${await targetName(mirror, tx)}»: в «${inverse.name}» уже ${MAX_LINK_TARGETS} ссылок, больше не добавить`
						);
					}
					await tx.paramRef.create({ data: { paramId: value.id, ...back } });
				}
			} else if (value) {
				const rest = value.refs.filter((r) => refId(r) !== idOf(holder));
				if (rest.length === 0) await tx.param.delete({ where: { id: value.id } });
				else await tx.paramRef.deleteMany({ where: { paramId: value.id, ...back } });
			}
		}
	}
	if (!actor) return;
	for (const { target, before } of touched.values()) {
		await recordParamChanges(actor, target, before, await signedRows(target, tx), tx);
	}
}

/**
 * Gives the types and items a holder's link values point at their inverse
 * values (for values copied without them: a part split off a record); the
 * history of each of them records the change.
 */
export async function mirrorLinksOf(actor: Actor, holder: ParamTarget, tx: Tx): Promise<void> {
	await syncMirrors(actor, holder, new Map(), linksOf(await signedRows(holder, tx)), tx);
}

/** The type or item a `params.changed` event is about. */
async function paramsSubject(target: ParamTarget, tx: Tx) {
	return 'typeId' in target
		? typeRef(await tx.itemType.findUniqueOrThrow({ where: { id: target.typeId } }))
		: itemSubject(tx, target.itemId);
}

/** Records which parameter values of a type or item were added, changed or removed. */
async function recordParamChanges(
	actor: Actor,
	target: ParamTarget,
	before: SignedRow[],
	after: SignedRow[],
	tx: Tx
): Promise<void> {
	const old = new Map(before.map((r) => [r.defId, r]));
	const now = new Map(after.map((r) => [r.defId, r]));
	const changes: (ParamChange & { defId: string })[] = [];
	for (const r of after) {
		const was = old.get(r.defId);
		if (!was) changes.push({ defId: r.defId, name: r.def.name, change: 'added' });
		else if (valueSignature(was) !== valueSignature(r)) {
			changes.push({ defId: r.defId, name: r.def.name, change: 'changed' });
		}
	}
	for (const r of before) {
		if (!now.has(r.defId)) changes.push({ defId: r.defId, name: r.def.name, change: 'removed' });
	}
	if (changes.length === 0) return;
	await recordEvent(tx, actor, {
		kind: 'params.changed',
		subject: await paramsSubject(target, tx),
		data: { changes: changes.map(({ name, change }) => ({ name, change })) },
		refIds: changes.map((c) => c.defId)
	});
}

/**
 * Parameters the categories of the target's type require on it: on a type,
 * those required «у типа»; on an item, those required «у каждой вещи». Keyed
 * by definition id, with the requiring categories.
 */
export async function requiredDefsOf(
	target: ParamTarget,
	tx: Tx = db
): Promise<Map<string, CategoryRef[]>> {
	const [typeId, level]: [string | null, ParamLevel] =
		'typeId' in target
			? [target.typeId, 'TYPE']
			: [
					(await tx.item.findUnique({ where: { id: target.itemId }, select: { typeId: true } }))
						?.typeId ?? null,
					'ITEM'
				];
	const result = new Map<string, CategoryRef[]>();
	if (!typeId) return result;
	const rows = await tx.categoryParam.findMany({
		where: { level, category: { types: { some: { typeId } } } },
		include: { category: { select: { id: true, name: true } } },
		orderBy: [{ category: { name: 'asc' } }, { position: 'asc' }]
	});
	for (const r of rows) result.set(r.defId, [...(result.get(r.defId) ?? []), r.category]);
	return result;
}

/** A required value cannot be removed (it can be changed); gaps left from before may stay. */
async function assertNotRequired(
	target: ParamTarget,
	removed: { defId: string; def: { name: string } }[],
	tx: Tx
): Promise<void> {
	if (removed.length === 0) return;
	const required = await requiredDefsOf(target, tx);
	for (const r of removed) {
		const categories = required.get(r.defId);
		if (categories) {
			throw new ConflictError(
				`«${r.def.name}» нельзя удалить: он обязателен ${inCategories(categories)}`
			);
		}
	}
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
		case 'BOOLEAN':
			return { valueType: p.valueType, boolValue: p.value };
		case 'ITEM':
		case 'TYPE':
			return { valueType: p.valueType };
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
		case 'BOOLEAN':
			return { ...base, valueType: 'BOOLEAN', value: row.boolValue ?? false };
		case 'ITEM':
		case 'TYPE':
			return { ...base, valueType: row.valueType, refIds: row.refs.map(refId) };
	}
}

/**
 * Stored parameters → views: units, enum options (current labels, list order)
 * and link targets (name, archived mark; sorted by name) are resolved in
 * batched queries.
 */
async function toViews(actor: Actor, rows: ParamRow[], tx: Tx): Promise<ParamView[]> {
	const optionIds = rows.flatMap((r) => r.enumValues.map((v) => v.optionId));
	const refItemIds = rows.flatMap((r) => r.refs.flatMap((ref) => (ref.itemId ? [ref.itemId] : [])));
	const refTypeIds = rows.flatMap((r) => r.refs.flatMap((ref) => (ref.typeId ? [ref.typeId] : [])));
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
		if (view.valueType === 'ITEM' || view.valueType === 'TYPE') {
			view.refs = row.refs
				.flatMap((ref) => {
					const item = ref.itemId ? itemsById.get(ref.itemId) : undefined;
					const type = ref.typeId ? typesById.get(ref.typeId) : undefined;
					if (item) {
						const name = itemDisplayName(item);
						return [{ id: item.id, name, archived: item.status === 'ARCHIVED' }];
					}
					return type ? [{ id: type.id, name: type.name, archived: false }] : [];
				})
				.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
			view.refIds = view.refs.map((r) => r.id);
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
		include: { enumValues: true, refs: true, def: true },
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
async function findDefs(actor: Actor, ids: string[], tx: Tx): Promise<Map<string, DefRow>> {
	const defs = await tx.paramDef.findMany({
		where: { id: { in: ids }, ...visibleTo(actor) },
		include: { inverse: true }
	});
	const byId = new Map(defs.map((d) => [d.id, d]));
	if (ids.some((id) => !byId.has(id))) throw new ValidationError('Параметр не найден');
	return byId;
}

/**
 * Checks one value against its definition and the references inside it:
 * value type, drop-down options, link targets, uploaded files. A link lives
 * on one kind of holder (its inverse's value type) and points at visible
 * types or ordinary items other than the holder itself; a newly linked item
 * must be active, `kept` are what the holder's value of this definition
 * already points at (a link kept as is stays valid after its item went to
 * the archive).
 */
async function assertValueValid(
	actor: Actor,
	def: DefRow,
	p: ParamInput,
	tx: Tx,
	target: ParamTarget,
	kept: Set<string> = new Set()
): Promise<void> {
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
	if (p.valueType === 'ITEM' || p.valueType === 'TYPE') {
		if (!def.inverse) throw new ValidationError(`«${def.name}»: у связи нет второй стороны`);
		if (def.inverse.valueType !== kindOf(target)) {
			throw new ValidationError(
				`«${def.name}» задаётся только ${LINK_HOLDER_LABELS[def.inverse.valueType as LinkKind]}`
			);
		}
		if (p.refIds.includes(idOf(target))) {
			throw new ValidationError(
				`«${def.name}»: ${p.valueType === 'ITEM' ? 'вещь' : 'тип'} не может ссылаться на ${p.valueType === 'ITEM' ? 'саму' : 'самого'} себя`
			);
		}
		if (p.valueType === 'ITEM') {
			const items = await tx.item.findMany({
				where: { id: { in: p.refIds }, isWorkbench: false, ...visibleTo(actor) },
				include: { type: { select: { name: true } } }
			});
			if (items.length !== p.refIds.length) {
				throw new ValidationError(`«${def.name}»: вещь не найдена`);
			}
			const archived = items.find((i) => i.status !== 'ACTIVE' && !kept.has(i.id));
			if (archived) {
				throw new ValidationError(`«${def.name}»: «${itemDisplayName(archived)}» в архиве`);
			}
		} else {
			const found = await tx.itemType.count({
				where: { id: { in: p.refIds }, ...visibleTo(actor) }
			});
			if (found !== p.refIds.length) throw new ValidationError(`«${def.name}»: тип не найден`);
		}
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

function linkRefs(p: ParamInput) {
	if (p.valueType === 'ITEM') return { create: p.refIds.map((itemId) => ({ itemId })) };
	if (p.valueType === 'TYPE') return { create: p.refIds.map((typeId) => ({ typeId })) };
	return undefined;
}

/** Link targets of inputs, by definition. */
function inputLinks(params: ParamInput[]): Map<string, Set<string>> {
	return new Map(
		params.flatMap((p) =>
			p.valueType === 'ITEM' || p.valueType === 'TYPE' ? [[p.defId, new Set(p.refIds)]] : []
		)
	);
}

/**
 * Replaces the whole parameter list of a target inside a transaction.
 * Returns file keys the target no longer uses (to delete after commit).
 */
export async function replaceParams(
	actor: Actor,
	target: ParamTarget,
	inputs: unknown,
	tx: Tx,
	{ record = true }: { record?: boolean } = {}
): Promise<string[]> {
	const params = paramListSchema.parse(inputs);
	await assertTargetEditable(actor, target, tx);
	const defs = await findDefs(
		actor,
		params.map((p) => p.defId),
		tx
	);
	const where = targetWhere(target);
	const old = await signedRows(target, tx);
	const oldLinks = linksOf(old);
	for (const p of params) {
		await assertValueValid(actor, defs.get(p.defId)!, p, tx, target, oldLinks.get(p.defId));
	}

	const kept = new Set(params.map((p) => p.defId));
	await assertNotRequired(
		target,
		old.filter((r) => !kept.has(r.defId)),
		tx
	);
	await tx.param.deleteMany({ where });
	for (const [position, p] of params.entries()) {
		await tx.param.create({
			data: {
				...where,
				...rowData(defs.get(p.defId)!, p),
				position,
				enumValues: enumValues(p),
				refs: linkRefs(p)
			}
		});
	}
	if (record) await recordParamChanges(actor, target, old, await signedRows(target, tx), tx);
	await syncMirrors(actor, target, linksOf(old), inputLinks(params), tx);
	const keptFiles = new Set(params.flatMap((p) => (p.valueType === 'FILE' ? [p.fileKey] : [])));
	return old.flatMap((r) => (r.fileKey && !keptFiles.has(r.fileKey) ? [r.fileKey] : []));
}

/** Replaces the whole parameter list of a type or an item in one call. */
export async function setParams(
	actor: Actor,
	target: ParamTarget,
	inputs: unknown
): Promise<ParamView[]> {
	const dropped = await writeTransaction((tx) => replaceParams(actor, target, inputs, tx));
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
	const id = await writeTransaction(async (tx) => {
		await assertTargetEditable(actor, target, tx);
		const def = (await findDefs(actor, [p.defId], tx)).get(p.defId)!;
		await assertValueValid(actor, def, p, tx, target);
		const where = targetWhere(target);
		if (await tx.param.findFirst({ where: { ...where, defId: def.id } })) {
			throw new ConflictError(`Параметр «${def.name}» уже есть — измените его значение`);
		}
		const last = await tx.param.aggregate({ where, _max: { position: true } });
		const before = await signedRows(target, tx);
		const row = await tx.param.create({
			data: {
				...where,
				...rowData(def, p),
				position: (last._max.position ?? -1) + 1,
				enumValues: enumValues(p),
				refs: linkRefs(p)
			}
		});
		await recordParamChanges(actor, target, before, await signedRows(target, tx), tx);
		await syncMirrors(actor, target, new Map(), inputLinks([p]), tx);
		return row.id;
	});
	return getParam(actor, id);
}

function paramTarget(param: Pick<Param, 'typeId' | 'itemId'>): ParamTarget {
	return param.typeId ? { typeId: param.typeId } : { itemId: param.itemId ?? '' };
}

/** A stored value the actor can see (through its type or item). */
async function findParam(actor: Actor, id: string, tx: Tx = db) {
	const param = await tx.param.findFirst({
		where: { id, OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }] },
		include: { def: { include: { inverse: true } }, refs: true }
	});
	if (!param) throw new NotFoundError('Параметр не найден');
	return param;
}

export async function getParam(actor: Actor, id: string, tx: Tx = db): Promise<ParamView> {
	const row = await tx.param.findFirstOrThrow({
		where: { id: (await findParam(actor, id, tx)).id },
		include: { enumValues: true, refs: true, def: true }
	});
	return (await toViews(actor, [row], tx))[0]!;
}

/** Changes a stored value; its parameter stays the same. */
export async function updateParam(actor: Actor, id: string, input: unknown): Promise<ParamView> {
	const p = paramInputSchema.parse(input);
	const dropped = await writeTransaction(async (tx) => {
		const param = await findParam(actor, id, tx);
		if (p.defId !== param.defId) throw new ValidationError('Параметр значения менять нельзя');
		const target = paramTarget(param);
		if (param.itemId) await assertItemEditable(param.itemId, tx);
		await assertValueValid(actor, param.def, p, tx, target, linksOf([param]).get(param.defId));
		const before = await signedRows(target, tx);
		await tx.paramEnumValue.deleteMany({ where: { paramId: id } });
		await tx.paramRef.deleteMany({ where: { paramId: id } });
		const cleared = {
			textValue: null,
			numberValue: null,
			numberMax: null,
			dateValue: null,
			boolValue: null,
			fileKey: null,
			fileName: null,
			fileMime: null,
			fileSize: null
		};
		await tx.param.update({
			where: { id },
			data: { ...cleared, ...rowData(param.def, p), enumValues: enumValues(p), refs: linkRefs(p) }
		});
		await recordParamChanges(actor, target, before, await signedRows(target, tx), tx);
		await syncMirrors(actor, target, linksOf([param]), inputLinks([p]), tx);
		const keep = p.valueType === 'FILE' ? p.fileKey : null;
		return param.fileKey && param.fileKey !== keep ? [param.fileKey] : [];
	});
	await deleteUnreferencedFiles(dropped);
	return getParam(actor, id);
}

export async function deleteParam(actor: Actor, id: string): Promise<void> {
	const param = await writeTransaction(async (tx) => {
		const param = await findParam(actor, id, tx);
		const target = paramTarget(param);
		if (param.itemId) await assertItemEditable(param.itemId, tx);
		await assertNotRequired(target, [param], tx);
		const before = await signedRows(target, tx);
		await tx.param.delete({ where: { id } });
		await recordParamChanges(actor, target, before, await signedRows(target, tx), tx);
		await syncMirrors(actor, target, linksOf([param]), new Map(), tx);
		return param;
	});
	if (param.fileKey) await deleteUnreferencedFiles([param.fileKey]);
}

/** Moves a value one place up (-1) or down (+1) in its list. */
export async function moveParam(actor: Actor, id: string, delta: -1 | 1): Promise<void> {
	await writeTransaction(async (tx) => {
		const param = await findParam(actor, id, tx);
		if (param.itemId) await assertItemEditable(param.itemId, tx);
		const where = param.typeId ? { typeId: param.typeId } : { itemId: param.itemId };
		const list = await tx.param.findMany({
			where,
			orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
			select: { id: true, position: true }
		});
		const from = list.findIndex((r) => r.id === id);
		const to = from + delta;
		if (to < 0 || to >= list.length) return;
		[list[from], list[to]] = [list[to]!, list[from]!];
		// Positions become the list indexes; only rows whose position differs are written.
		for (const [position, row] of list.entries()) {
			if (row.position !== position) {
				await tx.param.update({ where: { id: row.id }, data: { position } });
			}
		}
		await recordEvent(tx, actor, {
			kind: 'params.changed',
			subject: await paramsSubject(paramTarget(param), tx),
			data: { changes: [{ name: param.def.name, change: 'moved' }] },
			refIds: [param.defId]
		});
	});
}

// ---------------------------------------------------------------------------
// Definitions («Параметры»)
// ---------------------------------------------------------------------------

export const defInclude = {
	dictionary: {
		include: {
			options: {
				orderBy: { position: 'asc' },
				include: { _count: { select: { values: true } } }
			}
		}
	},
	inverse: { select: { id: true, name: true, valueType: true, ownerId: true, householdId: true } }
} satisfies Prisma.ParamDefInclude;

/**
 * Definitions as the pages show them. Usage counts cover the types and items
 * the actor sees; without an actor (category requirements, where nobody shows
 * them) they are 0.
 */
export async function defViews(
	actor: Actor | null,
	defs: Prisma.ParamDefGetPayload<{ include: typeof defInclude }>[],
	tx: Tx
): Promise<ParamDefView[]> {
	const counts =
		actor && defs.length
			? await tx.param.groupBy({
					by: ['defId'],
					where: {
						defId: { in: defs.map((d) => d.id) },
						OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }]
					},
					_count: { typeId: true, itemId: true }
				})
			: [];
	const byDef = new Map(counts.map((c) => [c.defId, c._count]));
	return defs.map((d) => ({
		id: d.id,
		name: d.name,
		valueType: d.valueType,
		unit: d.unit,
		fileNameTemplate: d.fileNameTemplate,
		multiple: d.dictionary?.multiple ?? false,
		options: (d.dictionary?.options ?? []).map((o) => ({
			id: o.id,
			label: o.label,
			usage: o._count.values
		})),
		typeCount: byDef.get(d.id)?.typeId ?? 0,
		itemCount: byDef.get(d.id)?.itemId ?? 0,
		holder: d.inverse && isLink(d.inverse.valueType) ? d.inverse.valueType : null,
		inverse: d.inverse ? { id: d.inverse.id, name: d.inverse.name } : null
	}));
}

/** Parameter definitions sorted by name, with usage counts. */
export async function listParamDefs(actor: Actor): Promise<ParamDefView[]> {
	const defs = await db.paramDef.findMany({
		where: visibleTo(actor),
		include: defInclude,
		orderBy: { name: 'asc' }
	});
	return defViews(actor, defs, db);
}

/** What of a definition the history compares. */
function defSummary(def: Prisma.ParamDefGetPayload<{ include: typeof defInclude }>) {
	return {
		name: def.name,
		unit: def.unit,
		fileNameTemplate: def.fileNameTemplate,
		valueType: PARAM_VALUE_TYPE_LABELS[def.valueType],
		multiple: def.dictionary?.multiple ?? null,
		options: def.dictionary?.options.map((o) => o.label).join(', ') ?? null,
		inverse: def.inverse?.name ?? null
	};
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
		where: { defId: id, OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }] },
		include: {
			type: { select: { id: true, name: true } },
			item: { include: { type: { select: { name: true } } } }
		}
	});
	const collator = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru');
	return {
		def: (await defViews(actor, [def], db))[0]!,
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

export async function createParamDef(actor: Actor, input: unknown): Promise<ParamDefView> {
	const { options, multiple, holder, inverseName, ...data } = paramDefInputSchema.parse(input);
	if (options.some((o) => o.id)) throw new ValidationError('У новых вариантов не бывает id');
	const id = await writeTransaction(async (tx) => {
		await assertNameFree('paramDef', actor, data.name, null, tx);
		const dictionaryId =
			data.valueType === 'ENUM'
				? await createOptionList(actor, { name: data.name, multiple, options }, tx)
				: null;
		const def = await tx.paramDef.create({ data: { ...data, dictionaryId, ...ownedBy(actor) } });
		await recordEvent(tx, actor, { kind: 'paramDef.created', subject: paramDefRef(def), data: {} });
		if (holder && inverseName) await createInverse(actor, def, holder, inverseName, tx);
		return def.id;
	});
	return (await getParamDef(actor, id)).def;
}

/**
 * Gives a new link its inverse: itself when symmetric (the same name, item ↔
 * item or type ↔ type), otherwise a new definition that lives where the link
 * points and points where the link lives.
 */
async function createInverse(
	actor: Actor,
	def: ParamDef,
	holder: LinkKind,
	inverseName: string,
	tx: Tx
): Promise<void> {
	if (isSymmetric({ ...def, holder, inverseName })) {
		await tx.paramDef.update({ where: { id: def.id }, data: { inverseId: def.id } });
		return;
	}
	await assertNameFree('paramDef', actor, inverseName, null, tx);
	const inverse = await tx.paramDef.create({
		data: { name: inverseName, valueType: holder, inverseId: def.id, ...ownedBy(actor) }
	});
	await tx.paramDef.update({ where: { id: def.id }, data: { inverseId: inverse.id } });
	await recordEvent(tx, actor, {
		kind: 'paramDef.created',
		subject: paramDefRef(inverse),
		data: {}
	});
}

/**
 * Renames a definition (every value shows the new name at once), changes its
 * unit or its drop-down options. The value type can change only while no
 * type or item has a value, and never to or from a link: a link and its
 * inverse are made together. A link can rename its inverse; where it lives,
 * what it points at and whether it is symmetric stay as created.
 */
export async function updateParamDef(
	actor: Actor,
	id: string,
	input: unknown
): Promise<ParamDefView> {
	const { options, multiple, holder, inverseName, ...data } = paramDefInputSchema.parse(input);
	await writeTransaction(async (tx) => {
		const def = await findDef(actor, id, tx);
		await assertNameFree('paramDef', actor, data.name, id, tx);
		if (isLink(def.valueType) || isLink(data.valueType)) {
			assertLinkKept(def, { ...data, holder, inverseName });
		} else if (
			data.valueType !== def.valueType &&
			(await tx.param.count({ where: { defId: id } }))
		) {
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
		const inverse = def.inverse && def.inverse.id !== id ? def.inverse : null;
		if (inverse && inverseName && inverseName !== inverse.name) {
			await assertNameFree('paramDef', actor, inverseName, inverse.id, tx);
			const before = await findDef(actor, inverse.id, tx);
			await tx.paramDef.update({ where: { id: inverse.id }, data: { name: inverseName } });
			await recordDefChanges(actor, before, await findDef(actor, inverse.id, tx), tx);
		}
		await recordDefChanges(actor, def, await findDef(actor, id, tx), tx);
	});
	return (await getParamDef(actor, id)).def;
}

type FullDef = Prisma.ParamDefGetPayload<{ include: typeof defInclude }>;

async function recordDefChanges(actor: Actor, before: FullDef, after: FullDef, tx: Tx) {
	const changes = diffFields(defSummary(before), defSummary(after));
	if (changes.length) {
		await recordEvent(tx, actor, {
			kind: 'paramDef.updated',
			subject: paramDefRef(after),
			data: { changes }
		});
	}
}

/** A link stays the same kind of link: what it points at, where it lives, symmetric or not. */
function assertLinkKept(
	def: FullDef,
	next: {
		name: string;
		valueType: ParamDef['valueType'];
		holder: LinkKind | null;
		inverseName: string | null;
	}
): void {
	const fixed = 'Вид связи задаётся при создании — удалите параметр и создайте заново';
	if (!isLink(def.valueType) || !def.inverse) {
		throw new ConflictError('Связью можно сделать только новый параметр');
	}
	if (next.valueType !== def.valueType || next.holder !== def.inverse.valueType) {
		throw new ConflictError(fixed);
	}
	const symmetric = def.inverse.id === def.id;
	if (isSymmetric(next) !== symmetric) {
		throw new ConflictError(
			symmetric
				? 'У симметричной связи параметр у связанной вещи называется так же'
				: `${fixed}: параметр у связанной вещи не может называться так же`
		);
	}
}

/**
 * Deletes a definition no type or item has a value of (with its options). A
 * link goes together with its inverse.
 */
export async function deleteParamDef(actor: Actor, id: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const def = await findDef(actor, id, tx);
		const ids = [...new Set([id, ...(def.inverse ? [def.inverse.id] : [])])];
		const used = await tx.param.count({ where: { defId: { in: ids } } });
		if (used > 0) {
			throw new ConflictError(
				`Параметр задан у типов и вещей (${used}) — сначала удалите значения`
			);
		}
		const categories = await tx.category.findMany({
			where: { params: { some: { defId: { in: ids } } } },
			select: { name: true },
			orderBy: { name: 'asc' }
		});
		if (categories.length > 0) {
			throw new ConflictError(
				`Параметр обязателен в категориях: ${categories.map((c) => `«${c.name}»`).join(', ')} — сначала уберите его оттуда`
			);
		}
		for (const d of ids.length > 1 ? [def, def.inverse!] : [def]) {
			await recordEvent(tx, actor, { kind: 'paramDef.deleted', subject: paramDefRef(d), data: {} });
		}
		await tx.paramDef.deleteMany({ where: { id: { in: ids } } });
		if (def.dictionaryId) await tx.enumDictionary.delete({ where: { id: def.dictionaryId } });
	});
}
