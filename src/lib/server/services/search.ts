import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { formatPath } from '$lib/domain/item';
import { likePattern, parseSearchQuery } from '$lib/domain/search';
import { getPaths, type PathNode } from './paths';

/** Upper bound of matching item records per query. */
const MAX_MATCHES = 500;

export interface SearchLocation {
	itemId: string;
	/** Display name of the item record (own name or type name). */
	name: string;
	quantity: number;
	isContainer: boolean;
	path: PathNode[];
}

/** One type in the results: total quantity and every place it lies in. */
export interface SearchGroup {
	typeId: string;
	typeName: string;
	photoKey: string | null;
	total: number;
	locations: SearchLocation[];
}

/** SQL counterpart of `visibleTo(actor)` for an item alias. */
function visibleSql(actor: Actor): Prisma.Sql {
	return Prisma.sql`(i."ownerId" = ${actor.userId}::uuid OR i."householdId" = ANY(${actor.householdIds}::uuid[]))`;
}

/**
 * A parameter's value as searchable text: strings and URLs, numbers (with
 * both «.» and «,» decimals) and units, file names, ISO dates, «да»/«нет»,
 * enum option labels and REF target names.
 */
const PARAM_VALUE_TEXT = Prisma.sql`concat_ws(' ',
	p."textValue",
	trim_scale(p."numberValue"::numeric)::text,
	replace(trim_scale(p."numberValue"::numeric)::text, '.', ','),
	trim_scale(p."numberMax"::numeric)::text,
	replace(trim_scale(p."numberMax"::numeric)::text, '.', ','),
	CASE WHEN p."valueType" IN ('NUMBER', 'RANGE') THEN d.unit END,
	p."fileName",
	to_char(p."dateValue", 'YYYY-MM-DD'),
	CASE WHEN p."boolValue" THEN 'да' WHEN NOT p."boolValue" THEN 'нет' END,
	(SELECT string_agg(o.label, ' ') FROM "ParamEnumValue" ev
		JOIN "EnumOption" o ON o.id = ev."optionId" WHERE ev."paramId" = p.id),
	(SELECT COALESCE(NULLIF(TRIM(ri.name), ''), rit.name) FROM "Item" ri
		LEFT JOIN "ItemType" rit ON rit.id = ri."typeId" WHERE ri.id = p."refItemId"),
	(SELECT rt.name FROM "ItemType" rt WHERE rt.id = p."refTypeId")
)`;

/**
 * True when item `i` has a parameter matching `condition`: its own, or one of
 * its type's that no own value of the same parameter overrides. `d` is the
 * parameter definition (its name is the key, its unit is part of the value).
 */
function hasParam(condition: Prisma.Sql): Prisma.Sql {
	return Prisma.sql`EXISTS (
		SELECT 1 FROM "Param" p
		JOIN "ParamDef" d ON d.id = p."defId"
		WHERE (
			p."itemId" = i.id
			OR (p."typeId" = i."typeId" AND NOT EXISTS (
				SELECT 1 FROM "Param" ip
				WHERE ip."itemId" = i.id AND ip."defId" = p."defId"
			))
		)
		AND ${condition}
	)`;
}

/**
 * Case-insensitive substring search over item own names, type names and
 * descriptions and parameter keys and values; «ключ: значение» also matches parameters with
 * that key and value. Active ordinary items only. Results are grouped by type.
 */
export async function search(actor: Actor, input: string): Promise<SearchGroup[]> {
	const query = parseSearchQuery(input);
	if (!query.text) return [];
	const pattern = likePattern(query.text);
	const conditions = [
		Prisma.sql`i.name ILIKE ${pattern}`,
		Prisma.sql`t.name ILIKE ${pattern}`,
		Prisma.sql`t.description ILIKE ${pattern}`,
		hasParam(Prisma.sql`(d.name ILIKE ${pattern} OR ${PARAM_VALUE_TEXT} ILIKE ${pattern})`)
	];
	if (query.param) {
		conditions.push(
			hasParam(
				Prisma.sql`(d.name ILIKE ${likePattern(query.param.key)} AND ${PARAM_VALUE_TEXT} ILIKE ${likePattern(query.param.value)})`
			)
		);
	}

	const rows = await db.$queryRaw<
		{
			id: string;
			name: string | null;
			quantity: number;
			is_container: boolean;
			type_id: string;
			type_name: string;
			photo_key: string | null;
		}[]
	>`
		SELECT i.id::text, i.name, i.quantity, t."isContainer" AS is_container, t.id::text AS type_id, t.name AS type_name,
			t."photoKey" AS photo_key
		FROM "Item" i
		JOIN "ItemType" t ON t.id = i."typeId"
		WHERE ${visibleSql(actor)}
			AND i.status = 'ACTIVE' AND NOT i."isWorkbench"
			AND (${Prisma.join(conditions, ' OR ')})
		LIMIT ${MAX_MATCHES}
	`;

	const paths = await getPaths(rows.map((r) => r.id));
	const groups = new Map<string, SearchGroup>();
	for (const row of rows) {
		let group = groups.get(row.type_id);
		if (!group) {
			group = {
				typeId: row.type_id,
				typeName: row.type_name,
				photoKey: row.photo_key,
				total: 0,
				locations: []
			};
			groups.set(row.type_id, group);
		}
		group.total += row.quantity;
		group.locations.push({
			itemId: row.id,
			name: row.name?.trim() || row.type_name,
			quantity: row.quantity,
			isContainer: row.is_container,
			path: paths.get(row.id) ?? []
		});
	}

	const exact = query.text.toLocaleLowerCase('ru');
	const isExact = (g: SearchGroup) => g.typeName.toLocaleLowerCase('ru') === exact;
	const result = [...groups.values()].sort(
		(a, b) => Number(isExact(b)) - Number(isExact(a)) || a.typeName.localeCompare(b.typeName, 'ru')
	);
	for (const group of result) {
		group.locations.sort((a, b) =>
			`${formatPath(a.path)} ${a.name}`.localeCompare(`${formatPath(b.path)} ${b.name}`, 'ru')
		);
	}
	return result;
}
