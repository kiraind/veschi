/**
 * Parameter values typed in a form before their type or item exists («Новая
 * вещь»): those the categories require, then those the user added.
 */
import type { CategoryRef, RequiredParam } from './categories';
import { emptyDraft, isEmptyDraft, type ParamDraft } from './param-draft';
import type { ParamDefView } from './params';

export interface ParamEntry {
	def: ParamDefView;
	draft: ParamDraft;
	/** Categories requiring it; empty → not required. */
	categories: CategoryRef[];
	/** Added by the user with «Параметр» (stays when no longer required). */
	added: boolean;
}

export function addedEntry(def: ParamDefView): ParamEntry {
	return { def, draft: emptyDraft(def), categories: [], added: true };
}

/**
 * The entries after the requirements changed: required ones first (typed
 * values kept), then the rest. A value no longer required stays when the user
 * added it or typed something; an untouched one goes.
 */
export function withRequired(entries: ParamEntry[], required: RequiredParam[]): ParamEntry[] {
	const byDef = new Map(entries.map((e) => [e.def.id, e]));
	const requiredIds = new Set(required.map((r) => r.def.id));
	return [
		...required.map((r) => {
			const e = byDef.get(r.def.id);
			return {
				def: r.def,
				draft: e?.draft ?? emptyDraft(r.def),
				categories: r.categories,
				added: e?.added ?? false
			};
		}),
		...entries
			.filter((e) => !requiredIds.has(e.def.id) && (e.added || !isEmptyDraft(e.draft)))
			.map((e) => ({ ...e, categories: [] }))
	];
}
