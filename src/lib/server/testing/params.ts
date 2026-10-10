import { db } from '$lib/server/db';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import type { z } from 'zod';
import type {
	ParamDefView,
	ParamInput,
	ParamValue,
	ParamView,
	paramInputSchema
} from '$lib/domain/params';
import { createParamDef, setParams, type ParamTarget } from '$lib/server/services/params';

/**
 * A parameter value given by its name, as tests write it. `unit` is stored on
 * the definition when this creates it (NUMBER, RANGE).
 */
export type KeyedParam = InputValue & { key: string; unit?: string | null };
type InputValue =
	z.input<typeof paramInputSchema> extends infer T
		? T extends unknown
			? Omit<T, 'defId'>
			: never
		: never;

/**
 * The definition with this name and value type, created when there is none
 * (with `unit`). An ENUM definition has to be created beforehand (`enumDef`).
 */
export async function defIdFor(
	actor: Actor,
	key: string,
	valueType: ParamValue['valueType'],
	unit: string | null = null
): Promise<string> {
	const name = key.trim();
	const existing = await db.paramDef.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, valueType, ...visibleTo(actor) }
	});
	if (existing) return existing.id;
	const created = await db.paramDef.create({
		data: { name, valueType, unit, ...ownedBy(actor) }
	});
	return created.id;
}

/** Turns name-based test parameters into inputs with definition ids. */
export async function keyed(actor: Actor, list: KeyedParam[]): Promise<ParamInput[]> {
	const result: ParamInput[] = [];
	for (const { key, unit, ...value } of list) {
		const defId = await defIdFor(actor, key, value.valueType, unit ?? null);
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

/** Creates a drop-down (ENUM) parameter with these options through the service. */
export async function enumDef(
	actor: Actor,
	name: string,
	labels: string[],
	multiple = false
): Promise<ParamDefView> {
	return createParamDef(actor, {
		name,
		valueType: 'ENUM',
		multiple,
		options: labels.map((label) => ({ label }))
	});
}

/** The option id of `label` in a definition. */
export function optionId(def: ParamDefView, label: string): string {
	const option = def.options.find((o) => o.label === label);
	if (!option) throw new Error(`No option «${label}» in «${def.name}»`);
	return option.id;
}
