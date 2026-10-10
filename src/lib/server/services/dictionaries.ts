import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';

const label = z.string().trim().min(1, 'Пустой вариант').max(100);

export const dictionaryInputSchema = z.object({
	name: z.string().trim().min(1, 'Укажите название').max(100),
	multiple: z.boolean().default(false),
	/** The full ordered option list; options with an id are kept (and renamed), others are new. */
	options: z.array(z.object({ id: z.uuid().optional(), label })).max(200)
});

export type DictionaryInput = z.input<typeof dictionaryInputSchema>;

export interface DictionaryView {
	id: string;
	name: string;
	multiple: boolean;
	options: { id: string; label: string; usage: number }[];
	/** Parameter definitions using this list. */
	usage: number;
}

function assertUniqueLabels(options: { label: string }[]): void {
	const seen = new Set<string>();
	for (const o of options) {
		const k = o.label.toLocaleLowerCase('ru');
		if (seen.has(k)) throw new ValidationError(`Вариант «${o.label}» повторяется`);
		seen.add(k);
	}
}

const withOptions = {
	options: {
		orderBy: { position: 'asc' },
		include: { _count: { select: { values: true } } }
	},
	_count: { select: { paramDefs: true } }
} satisfies Prisma.EnumDictionaryInclude;

function toView(
	d: Prisma.EnumDictionaryGetPayload<{ include: typeof withOptions }>
): DictionaryView {
	return {
		id: d.id,
		name: d.name,
		multiple: d.multiple,
		options: d.options.map((o) => ({ id: o.id, label: o.label, usage: o._count.values })),
		usage: d._count.paramDefs
	};
}

/** Dictionaries sorted by name, each with ordered options and usage counts. */
export async function listDictionaries(actor: Actor): Promise<DictionaryView[]> {
	const dictionaries = await db.enumDictionary.findMany({
		where: visibleTo(actor),
		include: withOptions,
		orderBy: { name: 'asc' }
	});
	return dictionaries.map(toView);
}

export async function getDictionary(actor: Actor, id: string): Promise<DictionaryView> {
	const dictionary = await db.enumDictionary.findFirst({
		where: { id, ...visibleTo(actor) },
		include: withOptions
	});
	if (!dictionary) throw new NotFoundError('Выпадающий список не найден');
	return toView(dictionary);
}

export async function createDictionary(actor: Actor, input: unknown): Promise<DictionaryView> {
	const { name, multiple, options } = dictionaryInputSchema.parse(input);
	if (options.some((o) => o.id)) throw new ValidationError('У новых вариантов не бывает id');
	assertUniqueLabels(options);
	const created = await db.enumDictionary.create({
		data: {
			name,
			multiple,
			...ownedBy(actor),
			options: { create: options.map((o, position) => ({ label: o.label, position })) }
		}
	});
	return getDictionary(actor, created.id);
}

/**
 * Updates the name, the single/multiple flag and the full option list.
 * Options are stored by id, so a rename shows in every parameter at once.
 * Removing an option that is in use, or making a dictionary single-choice
 * while some parameter has several options, is rejected.
 */
export async function updateDictionary(
	actor: Actor,
	id: string,
	input: unknown
): Promise<DictionaryView> {
	const { name, multiple, options } = dictionaryInputSchema.parse(input);
	assertUniqueLabels(options);
	await db.$transaction(async (tx) => {
		const dictionary = await tx.enumDictionary.findFirst({
			where: { id, ...visibleTo(actor) },
			include: { options: { include: { _count: { select: { values: true } } } } }
		});
		if (!dictionary) throw new NotFoundError('Выпадающий список не найден');

		const existing = new Map(dictionary.options.map((o) => [o.id, o]));
		if (options.some((o) => o.id && !existing.has(o.id))) {
			throw new ValidationError('Вариант не из этого списка');
		}
		const keptIds = new Set(options.flatMap((o) => (o.id ? [o.id] : [])));
		const removed = dictionary.options.filter((o) => !keptIds.has(o.id));
		const used = removed.find((o) => o._count.values > 0);
		if (used) {
			throw new ConflictError(
				`Вариант «${used.label}» используется в параметрах (${used._count.values}), его нельзя удалить`
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
					'Нельзя сделать выбор одиночным: в некоторых параметрах выбрано несколько вариантов'
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
	});
	return getDictionary(actor, id);
}

/** Deletes a list no parameter uses. */
export async function deleteDictionary(actor: Actor, id: string): Promise<void> {
	const dictionary = await getDictionary(actor, id);
	if (dictionary.usage > 0) {
		throw new ConflictError('Список используется в параметрах, его нельзя удалить');
	}
	await db.enumDictionary.delete({ where: { id } });
}
