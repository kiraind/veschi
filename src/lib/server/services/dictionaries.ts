/**
 * Option lists of drop-down (ENUM) parameters. In the interface a list is part
 * of its parameter («Параметры» page); in the database it is an
 * EnumDictionary owned by exactly one ParamDef. Called from services/params.ts
 * inside its transactions.
 */
import type { Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, type Actor } from '$lib/server/scope';

export interface OptionListInput {
	/** The parameter's name (lists are not shown on their own). */
	name: string;
	multiple: boolean;
	/** The full ordered option list; options with an id are kept (and renamed), others are new. */
	options: { id?: string; label: string }[];
}

/** Creates the option list of a new ENUM parameter; returns its id. */
export async function createOptionList(
	actor: Actor,
	{ name, multiple, options }: OptionListInput,
	tx: Tx
): Promise<string> {
	const created = await tx.enumDictionary.create({
		data: {
			name,
			multiple,
			...ownedBy(actor),
			options: { create: options.map((o, position) => ({ label: o.label, position })) }
		}
	});
	return created.id;
}

/**
 * Replaces the single/multiple flag and the full option list. Options are
 * stored by id, so a rename shows in every value at once. Removing an option
 * that is in use, or making the choice single while some value has several
 * options, is rejected.
 */
export async function updateOptionList(
	id: string,
	{ name, multiple, options }: OptionListInput,
	tx: Tx
): Promise<void> {
	const dictionary = await tx.enumDictionary.findUnique({
		where: { id },
		include: { options: { include: { _count: { select: { values: true } } } } }
	});
	if (!dictionary) throw new NotFoundError('Варианты параметра не найдены');

	const existing = new Map(dictionary.options.map((o) => [o.id, o]));
	if (options.some((o) => o.id && !existing.has(o.id))) {
		throw new ValidationError('Вариант не из этого параметра');
	}
	const keptIds = new Set(options.flatMap((o) => (o.id ? [o.id] : [])));
	const removed = dictionary.options.filter((o) => !keptIds.has(o.id));
	const used = removed.find((o) => o._count.values > 0);
	if (used) {
		throw new ConflictError(
			`Вариант «${used.label}» выбран в значениях (${used._count.values}), его нельзя удалить`
		);
	}
	if (!multiple && dictionary.multiple) {
		const several = await tx.paramEnumValue.groupBy({
			by: ['paramId'],
			where: { param: { dictionaryId: id } },
			having: { paramId: { _count: { gt: 1 } } }
		});
		if (several.length > 0) {
			throw new ConflictError(
				'Нельзя сделать выбор одиночным: в некоторых значениях выбрано несколько вариантов'
			);
		}
	}

	await tx.enumDictionary.update({ where: { id }, data: { name, multiple } });
	await tx.enumOption.deleteMany({ where: { id: { in: removed.map((o) => o.id) } } });
	for (const [position, o] of options.entries()) {
		if (o.id) {
			await tx.enumOption.update({ where: { id: o.id }, data: { label: o.label, position } });
		} else {
			await tx.enumOption.create({ data: { dictionaryId: id, label: o.label, position } });
		}
	}
}
