import type { Param, ParamEnumValue, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { paramListSchema, type ParamInput, type ParamView } from '$lib/domain/params';
import { deleteUnreferencedFiles, isOwnUpload } from './files';

/** Body of the PUT …/params endpoints. */
export const paramsBodySchema = z.object({ params: paramListSchema });

/** Whose parameter list: a type's (shared by its items) or one item's. */
export type ParamTarget = { typeId: string } | { itemId: string };

type ParamRow = Param & { enumValues: ParamEnumValue[] };

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
function toColumns(p: ParamInput): Omit<Prisma.ParamUncheckedCreateInput, 'key' | 'position'> {
	switch (p.valueType) {
		case 'STRING':
			return { valueType: p.valueType, textValue: p.text };
		case 'NUMBER':
			return { valueType: p.valueType, numberValue: p.value, unit: p.unit };
		case 'RANGE':
			return { valueType: p.valueType, numberValue: p.min, numberMax: p.max, unit: p.unit };
		case 'ENUM':
			return { valueType: p.valueType, dictionaryId: p.dictionaryId };
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
	const key = row.key;
	switch (row.valueType) {
		case 'STRING':
			return { key, valueType: 'STRING', text: row.textValue ?? '' };
		case 'NUMBER':
			return { key, valueType: 'NUMBER', value: row.numberValue ?? 0, unit: row.unit };
		case 'RANGE':
			return {
				key,
				valueType: 'RANGE',
				min: row.numberValue ?? 0,
				max: row.numberMax ?? 0,
				unit: row.unit
			};
		case 'ENUM':
			return {
				key,
				valueType: 'ENUM',
				dictionaryId: row.dictionaryId ?? '',
				optionIds: row.enumValues.map((v) => v.optionId)
			};
		case 'URL':
			return { key, valueType: 'URL', url: row.textValue ?? '' };
		case 'FILE':
			return {
				key,
				valueType: 'FILE',
				fileKey: row.fileKey ?? '',
				fileName: row.fileName ?? '',
				fileMime: row.fileMime ?? 'application/octet-stream',
				fileSize: row.fileSize ?? 0
			};
		case 'DATE':
			return { key, valueType: 'DATE', date: row.dateValue?.toISOString().slice(0, 10) ?? '' };
		case 'REF':
			return { key, valueType: 'REF', refItemId: row.refItemId, refTypeId: row.refTypeId };
		case 'BOOLEAN':
			return { key, valueType: 'BOOLEAN', value: row.boolValue ?? false };
	}
}

/**
 * Stored parameters → views: enum options (current labels, dictionary order)
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
		const view: ParamView = { ...fromRow(row), id: row.id };
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
		include: { enumValues: true },
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

/** Checks references inside the inputs: dictionaries, options, REF targets, uploaded files. */
async function assertReferencesValid(actor: Actor, params: ParamInput[], tx: Tx): Promise<void> {
	for (const p of params) {
		if (p.valueType === 'ENUM') {
			const dictionary = await tx.enumDictionary.findFirst({
				where: { id: p.dictionaryId, ...visibleTo(actor) },
				include: { options: { select: { id: true } } }
			});
			if (!dictionary) throw new ValidationError(`«${p.key}»: справочник не найден`);
			const known = new Set(dictionary.options.map((o) => o.id));
			if (!p.optionIds.every((id) => known.has(id))) {
				throw new ValidationError(`«${p.key}»: такого варианта нет в справочнике`);
			}
			if (!dictionary.multiple && new Set(p.optionIds).size > 1) {
				throw new ValidationError(
					`«${p.key}»: в справочнике «${dictionary.name}» можно выбрать только один вариант`
				);
			}
		}
		if (p.valueType === 'REF') {
			const found = p.refItemId
				? await tx.item.findFirst({
						where: { id: p.refItemId, isWorkbench: false, ...visibleTo(actor) }
					})
				: await tx.itemType.findFirst({ where: { id: p.refTypeId ?? '', ...visibleTo(actor) } });
			if (!found) throw new ValidationError(`«${p.key}»: вещь или тип не найдены`);
		}
		if (p.valueType === 'FILE' && !isOwnUpload(actor, p.fileKey)) {
			const known = await tx.param.findFirst({
				where: {
					fileKey: p.fileKey,
					OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }]
				}
			});
			if (!known) throw new ValidationError(`«${p.key}»: файл не найден, загрузите его заново`);
		}
	}
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
	await assertReferencesValid(actor, params, tx);

	const where = targetWhere(target);
	const old = await tx.param.findMany({ where, select: { fileKey: true } });
	await tx.param.deleteMany({ where });
	for (const [position, p] of params.entries()) {
		await tx.param.create({
			data: {
				...where,
				...toColumns(p),
				key: p.key,
				position,
				enumValues:
					p.valueType === 'ENUM'
						? { create: [...new Set(p.optionIds)].map((optionId) => ({ optionId })) }
						: undefined
			}
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
