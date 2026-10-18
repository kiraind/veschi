import type { ParamDef, Prisma } from '@prisma/client';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import {
	PARAM_VALUE_TYPE_LABELS,
	isLink,
	isSymmetric,
	paramDefInputSchema,
	type LinkKind,
	type ParamDefView
} from '$lib/domain/params';
import { diffFields } from '$lib/domain/history';
import { createOptionList, updateOptionList } from './dictionaries';
import { paramDefRef, recordEvent } from './history';
import { assertNameFree } from './names';

// Parameter definitions («Параметры»): name, value type, unit, options, links
// with their inverses. Values of them — services/params.ts.

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
