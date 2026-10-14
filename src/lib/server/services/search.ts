import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import { visibleSql, visibleTo, type Actor } from '$lib/server/scope';
import { formatPath } from '$lib/domain/item';
import { likePattern, parseSearchQuery } from '$lib/domain/search';
import { codeQuery } from '$lib/domain/sticker-code';
import { barcodeQuery } from '$lib/domain/barcode';
import { getPaths, type PathNode } from './paths';

/** Upper bound of matching item records per query. */
const MAX_MATCHES = 500;

export interface SearchLocation {
	itemId: string;
	/** Display name of the item record (own name or type name). */
	name: string;
	quantity: number;
	isContainer: boolean;
	/** The bound sticker's ID. */
	stickerCode: string | null;
	path: PathNode[];
}

/** One type in the results: total quantity and every place it lies in. */
export interface SearchGroup {
	typeId: string;
	typeName: string;
	photoKey: string | null;
	/** A container type (its placeholder without a photo is a box). */
	isContainer: boolean;
	total: number;
	locations: SearchLocation[];
}

/**
 * A parameter's value as searchable text: strings and URLs, numbers (with
 * both «.» and «,» decimals) and units, file names, ISO dates, «да»/«нет»,
 * enum option labels and names of linked items and types.
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
	(SELECT string_agg(COALESCE(NULLIF(TRIM(ri.name), ''), rit.name, rt.name), ' ')
		FROM "ParamRef" r
		LEFT JOIN "Item" ri ON ri.id = r."itemId"
		LEFT JOIN "ItemType" rit ON rit.id = ri."typeId"
		LEFT JOIN "ItemType" rt ON rt.id = r."typeId"
		WHERE r."paramId" = p.id)
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
 * descriptions, category names and parameter keys and values; «ключ: значение» also matches parameters with
 * that key and value; a piece of a sticker ID (3+ characters, dash optional) matches the item with that sticker; 4+ digits match items of the type with such a packaging barcode. Active ordinary items only. Results are grouped by type.
 */
export async function search(actor: Actor, input: string): Promise<SearchGroup[]> {
	return (await searchWithLimit(actor, input)).groups;
}

/**
 * Same as `search`, telling whether there were more matches than MAX_MATCHES
 * (the rest is left out: exact type name matches first, then by type name).
 */
export async function searchWithLimit(
	actor: Actor,
	input: string
): Promise<{ groups: SearchGroup[]; truncated: boolean }> {
	const query = parseSearchQuery(input);
	if (!query.text) return { groups: [], truncated: false };
	const pattern = likePattern(query.text);
	const conditions = [
		Prisma.sql`i.name ILIKE ${pattern}`,
		Prisma.sql`t.name ILIKE ${pattern}`,
		Prisma.sql`t.description ILIKE ${pattern}`,
		Prisma.sql`EXISTS (SELECT 1 FROM "TypeCategory" tc JOIN "Category" c ON c.id = tc."categoryId"
			WHERE tc."typeId" = t.id AND c.name ILIKE ${pattern})`,
		hasParam(Prisma.sql`(d.name ILIKE ${pattern} OR ${PARAM_VALUE_TEXT} ILIKE ${pattern})`)
	];
	const code = codeQuery(query.text);
	if (code) conditions.push(Prisma.sql`s.code LIKE ${likePattern(code)}`);
	const barcode = barcodeQuery(query.text);
	if (barcode) {
		conditions.push(Prisma.sql`t.barcode LIKE ${likePattern(barcode)}`);
	}
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
			sticker_code: string | null;
		}[]
	>`
		SELECT i.id::text, i.name, i.quantity, t."isContainer" AS is_container, t.id::text AS type_id, t.name AS type_name,
			t."photoKey" AS photo_key, s.code AS sticker_code
		FROM "Item" i
		JOIN "ItemType" t ON t.id = i."typeId"
		LEFT JOIN "Sticker" s ON s."itemId" = i.id AND s.status = 'BOUND'
		WHERE ${visibleSql(actor)}
			AND i.status = 'ACTIVE' AND NOT i."isWorkbench"
			AND (${Prisma.join(conditions, ' OR ')})
		ORDER BY lower(t.name) = lower(${query.text}) DESC, t.name, t.id, i.id
		LIMIT ${MAX_MATCHES + 1}
	`;
	const truncated = rows.length > MAX_MATCHES;
	if (truncated) rows.pop();

	const paths = await getPaths(rows.map((r) => r.id));
	const groups = new Map<string, SearchGroup>();
	for (const row of rows) {
		let group = groups.get(row.type_id);
		if (!group) {
			group = {
				typeId: row.type_id,
				typeName: row.type_name,
				photoKey: row.photo_key,
				isContainer: row.is_container,
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
			stickerCode: row.sticker_code,
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
	return { groups: result, truncated };
}

/** How many recent names and parameters the placeholder picks its examples from. */
const EXAMPLE_POOL = 50;

/** Names of types in use and text parameter values, for examples in the search field. */
export async function searchExamples(
	actor: Actor
): Promise<{ names: string[]; params: { key: string; value: string }[] }> {
	const [types, params] = await Promise.all([
		db.itemType.findMany({
			where: { ...visibleTo(actor), items: { some: { status: 'ACTIVE' } } },
			select: { name: true },
			orderBy: { updatedAt: 'desc' },
			take: EXAMPLE_POOL
		}),
		db.param.findMany({
			where: {
				valueType: 'STRING',
				textValue: { not: null },
				def: visibleTo(actor),
				OR: [
					{ type: { is: visibleTo(actor) } },
					{ item: { is: { ...visibleTo(actor), status: 'ACTIVE' } } }
				]
			},
			select: { textValue: true, def: { select: { name: true } } },
			orderBy: { updatedAt: 'desc' },
			take: EXAMPLE_POOL
		})
	]);
	return {
		names: types.map((t) => t.name),
		params: params.flatMap((p) => (p.textValue ? [{ key: p.def.name, value: p.textValue }] : []))
	};
}
