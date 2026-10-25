import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import { visibleSql, visibleTo, type Actor } from '$lib/server/scope';
import { formatPath } from '$lib/domain/item';
import {
	foldYo,
	LOOSE_SEPARATORS,
	escapeLike,
	likePattern,
	looseRegex,
	looseText,
	parseSearchQuery
} from '$lib/domain/search';
import { foldYoSql } from '$lib/server/sql';
import { CODE_LENGTH, codeQuery } from '$lib/domain/sticker-code';
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

/** Names of the items and types a link parameter `p` points to, space-separated. */
const PARAM_LINK_TEXT = Prisma.sql`(SELECT string_agg(COALESCE(NULLIF(TRIM(ri.name), ''), rit.name, rt.name), ' ')
	FROM "ParamRef" r
	LEFT JOIN "Item" ri ON ri.id = r."itemId"
	LEFT JOIN "ItemType" rit ON rit.id = ri."typeId"
	LEFT JOIN "ItemType" rt ON rt.id = r."typeId"
	WHERE r."paramId" = p.id)`;

/**
 * A parameter's own value as searchable text: strings and URLs, numbers (with
 * both «.» and «,» decimals) and units, file names, ISO dates, «да»/«нет» and
 * enum option labels. Names of linked items and types are `PARAM_LINK_TEXT`.
 */
const PARAM_OWN_TEXT = Prisma.sql`concat_ws(' ',
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
		JOIN "EnumOption" o ON o.id = ev."optionId" WHERE ev."paramId" = p.id)
)`;

/** A parameter's value as searchable text, its own and the names of linked things. */
const PARAM_VALUE_TEXT = Prisma.sql`concat_ws(' ', ${PARAM_OWN_TEXT}, ${PARAM_LINK_TEXT})`;

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
 * `expr` contains `text`, ignoring case, ё/е and, for part codes, spaces, hyphens
 * and dots («dip8», «DIP 8» and «DIP-8» find each other).
 */
function contains(column: Prisma.Sql, query: string): Prisma.Sql {
	const expr = foldYoSql(column);
	const text = foldYo(query);
	const loose = looseText(text);
	if (!loose) return Prisma.sql`${expr} ILIKE ${likePattern(text)}`;
	return Prisma.sql`(${expr} ILIKE ${likePattern(text)}
		OR regexp_replace(${expr}, ${LOOSE_SEPARATORS}, '', 'g') ILIKE ${likePattern(loose)})`;
}

/** A character that is not part of a word: what may stand before a word start. */
const NOT_WORD = '[^0-9a-zа-яё]';

/** `column` is the query as a whole, ignoring case, ё/е, spaces, hyphens and dots. */
function equalsLoose(column: Prisma.Sql, query: string): Prisma.Sql {
	const expr = foldYoSql(column);
	const text = foldYo(query);
	const loose = looseText(text);
	if (!loose) return Prisma.sql`lower(${expr}) = lower(${text})`;
	return Prisma.sql`lower(regexp_replace(${expr}, ${LOOSE_SEPARATORS}, '', 'g')) = lower(${loose})`;
}

/** `column` starts with the query (as `equalsLoose` compares). */
function startsWithLoose(column: Prisma.Sql, query: string): Prisma.Sql {
	const expr = foldYoSql(column);
	const text = foldYo(query);
	if (!looseText(text)) return Prisma.sql`${expr} ILIKE ${`${escapeLike(text)}%`}`;
	return Prisma.sql`${expr} ~* ${`^${NOT_WORD}*${looseRegex(text)}`}`;
}

/** A word in `column` starts with the query (as `equalsLoose` compares). */
function wordStartsWithLoose(column: Prisma.Sql, query: string): Prisma.Sql {
	const text = foldYo(query);
	if (!looseText(text)) return Prisma.sql`FALSE`;
	return Prisma.sql`${foldYoSql(column)} ~* ${`(^|${NOT_WORD})${looseRegex(text)}`}`;
}

/** How well a search result matches, best first; see `searchWithLimit`. */
const RANK = {
	exact: 1,
	nameStart: 2,
	wordStart: 3,
	inName: 4,
	keyValue: 5,
	category: 6,
	description: 7,
	param: 8,
	link: 9
} as const;

/**
 * Case- and ё/е-insensitive substring search over item own names, type names and
 * descriptions, category names and parameter keys and values, also with spaces, hyphens and dots ignored; «ключ: значение» also matches parameters with
 * that key and value; a piece of a sticker ID (3+ characters, dash optional) matches the item with that sticker; 4+ digits match items of the type with such a packaging barcode. Active ordinary items only. Results are grouped by type.
 */
export async function search(actor: Actor, input: string): Promise<SearchGroup[]> {
	return (await searchWithLimit(actor, input)).groups;
}

/**
 * Same as `search`, telling whether there were more matches than MAX_MATCHES
 * (the worst-ranked rest is left out).
 */
export async function searchWithLimit(
	actor: Actor,
	input: string
): Promise<{ groups: SearchGroup[]; truncated: boolean }> {
	const query = parseSearchQuery(input);
	if (!query.text) return { groups: [], truncated: false };
	const text = query.text;
	const names = [Prisma.sql`i.name`, Prisma.sql`t.name`];
	const anyName = (match: (column: Prisma.Sql, query: string) => Prisma.Sql) =>
		Prisma.sql`(${Prisma.join(
			names.map((n) => match(n, text)),
			' OR '
		)})`;
	// Every way a record can match, with its rank. A record takes the best rank
	// it qualifies for (the first matching `CASE` branch).
	const matches: [number, Prisma.Sql][] = [[RANK.exact, anyName(equalsLoose)]];
	const code = codeQuery(text);
	if (code?.length === CODE_LENGTH) matches.push([RANK.exact, Prisma.sql`s.code = ${code}`]);
	const barcode = barcodeQuery(text);
	if (barcode) matches.push([RANK.exact, Prisma.sql`t.barcode = ${barcode}`]);
	matches.push(
		[RANK.nameStart, anyName(startsWithLoose)],
		[RANK.wordStart, anyName(wordStartsWithLoose)],
		[RANK.inName, anyName(contains)]
	);
	if (code) matches.push([RANK.inName, Prisma.sql`s.code LIKE ${likePattern(code)}`]);
	if (barcode) matches.push([RANK.inName, Prisma.sql`t.barcode LIKE ${likePattern(barcode)}`]);
	if (query.param) {
		matches.push([
			RANK.keyValue,
			hasParam(
				Prisma.sql`(${contains(Prisma.sql`d.name`, query.param.key)} AND ${contains(PARAM_VALUE_TEXT, query.param.value)})`
			)
		]);
	}
	matches.push(
		[
			RANK.category,
			Prisma.sql`EXISTS (SELECT 1 FROM "TypeCategory" tc JOIN "Category" c ON c.id = tc."categoryId"
				WHERE tc."typeId" = t.id AND ${contains(Prisma.sql`c.name`, text)})`
		],
		[RANK.description, contains(Prisma.sql`t.description`, text)],
		[
			RANK.param,
			hasParam(
				Prisma.sql`(${contains(Prisma.sql`d.name`, text)} OR ${contains(PARAM_OWN_TEXT, text)})`
			)
		],
		[RANK.link, hasParam(contains(PARAM_LINK_TEXT, text))]
	);
	const rank = Prisma.sql`CASE ${Prisma.join(
		matches.map(([r, condition]) => Prisma.sql`WHEN ${condition} THEN ${r}::int`),
		' '
	)} END`;

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
			rank: number;
		}[]
	>`
		SELECT * FROM (
			SELECT i.id::text, i.name, i.quantity, t."isContainer" AS is_container, t.id::text AS type_id,
				t.name AS type_name, t."photoKey" AS photo_key, s.code AS sticker_code, ${rank} AS rank
			FROM "Item" i
			JOIN "ItemType" t ON t.id = i."typeId"
			LEFT JOIN "Sticker" s ON s."itemId" = i.id AND s.status = 'BOUND'
			WHERE ${visibleSql(actor)} AND i.status = 'ACTIVE' AND NOT i."isWorkbench"
		) found
		WHERE rank IS NOT NULL
		ORDER BY rank, type_name, type_id, id
		LIMIT ${MAX_MATCHES + 1}
	`;
	const truncated = rows.length > MAX_MATCHES;
	if (truncated) rows.pop();

	const paths = await getPaths(rows.map((r) => r.id));
	const groups = new Map<string, SearchGroup>();
	// Rows come best rank first, so a type's first row carries its best rank.
	const ranks = new Map<string, number>();
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
			ranks.set(row.type_id, row.rank);
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

	const result = [...groups.values()].sort(
		(a, b) =>
			ranks.get(a.typeId)! - ranks.get(b.typeId)! || a.typeName.localeCompare(b.typeName, 'ru')
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
