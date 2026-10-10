import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { LEGACY_UUID_RE } from '$lib/domain/id';

export type LegacyModel = 'Item' | 'ItemType' | 'ParamDef';

/** The cuid that replaced an old UUID id (see the cuid_ids migration), or null. */
export async function findNewId(model: LegacyModel, oldId: string): Promise<string | null> {
	if (!LEGACY_UUID_RE.test(oldId)) return null;
	const row = await db.legacyId.findUnique({ where: { oldId: oldId.toLowerCase() } });
	return row?.model === model ? row.newId : null;
}

/**
 * Old links (`/items/<uuid>`) keep working: a page load calls this first and
 * is redirected to the same page under the new id. Access is checked there.
 */
export async function redirectLegacyId(
	model: LegacyModel,
	id: string,
	path: (newId: string) => string
): Promise<void> {
	const newId = await findNewId(model, id);
	if (newId) redirect(301, path(newId));
}
