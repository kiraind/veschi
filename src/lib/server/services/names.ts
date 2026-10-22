import { escapeLike } from '$lib/domain/search';
import { normalizeParamKey } from '$lib/domain/params';
import type { Tx } from '$lib/server/db';
import { ConflictError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';

/** Things whose names are unique among what one actor sees, as messages name them. */
const NAMED = { paramDef: 'Параметр', category: 'Категория', collection: 'Коллекция' } as const;

/**
 * Refuses a name another visible definition, category or collection already
 * has (ignoring case and surrounding spaces); `exceptId` is the one being
 * renamed.
 */
export async function assertNameFree(
	model: keyof typeof NAMED,
	actor: Actor,
	name: string,
	exceptId: string | null,
	tx: Tx
): Promise<void> {
	const args = {
		where: {
			name: { equals: escapeLike(name), mode: 'insensitive' as const },
			...visibleTo(actor),
			...(exceptId ? { id: { not: exceptId } } : {})
		},
		select: { name: true }
	};
	const same =
		model === 'paramDef'
			? await tx.paramDef.findMany(args)
			: model === 'category'
				? await tx.category.findMany(args)
				: await tx.collection.findMany(args);
	if (same.some((r) => normalizeParamKey(r.name) === normalizeParamKey(name))) {
		throw new ConflictError(`${NAMED[model]} «${name}» уже есть`);
	}
}
