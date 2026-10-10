import { db } from '$lib/server/db';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import type { z } from 'zod';
import type { ParamInput, ParamValue, ParamView, paramInputSchema } from '$lib/domain/params';
import { setParams, type ParamTarget } from '$lib/server/services/params';

/** A parameter value given by its name, as tests write it; ENUM also names its list. */
export type KeyedParam = InputValue & { key: string; dictionaryId?: string };
type InputValue =
	z.input<typeof paramInputSchema> extends infer T
		? T extends unknown
			? Omit<T, 'defId'>
			: never
		: never;

/** The definition with this name and value type, created when there is none. */
export async function defIdFor(
	actor: Actor,
	key: string,
	valueType: ParamValue['valueType'],
	dictionaryId: string | null = null
): Promise<string> {
	const name = key.trim();
	const existing = await db.paramDef.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, valueType, ...visibleTo(actor) }
	});
	if (existing) return existing.id;
	const created = await db.paramDef.create({
		data: { name, valueType, dictionaryId, ...ownedBy(actor) }
	});
	return created.id;
}

/** Turns name-based test parameters into inputs with definition ids. */
export async function keyed(actor: Actor, list: KeyedParam[]): Promise<ParamInput[]> {
	const result: ParamInput[] = [];
	for (const { key, dictionaryId, ...value } of list) {
		const defId = await defIdFor(actor, key, value.valueType, dictionaryId ?? null);
		result.push({ ...value, defId } as ParamInput);
	}
	return result;
}

/** `setParams` with name-based parameters. */
export async function setKeyedParams(
	actor: Actor,
	target: ParamTarget,
	list: KeyedParam[]
): Promise<ParamView[]> {
	return setParams(actor, target, await keyed(actor, list));
}
