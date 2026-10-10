-- Review round 3 (see docs/decisions.md, «Третья порция замечаний»).

-- ---------------------------------------------------------------------------
-- Units belong to the parameter: the most frequent unit among its values
-- (counted before anything below copies values).
-- ---------------------------------------------------------------------------
ALTER TABLE "ParamDef" ADD COLUMN "unit" TEXT;

UPDATE "ParamDef" d SET "unit" = u.unit
FROM (
	SELECT "defId", mode() WITHIN GROUP (ORDER BY TRIM("unit")) AS unit
	FROM "Param"
	WHERE NULLIF(TRIM("unit"), '') IS NOT NULL
	GROUP BY "defId"
) u
WHERE d.id = u."defId" AND d."valueType" IN ('NUMBER', 'RANGE');

-- ---------------------------------------------------------------------------
-- Types get a description and the container mark. A type becomes a container
-- when at least one of its items was one.
-- ---------------------------------------------------------------------------
ALTER TABLE "ItemType" ADD COLUMN "description" TEXT,
ADD COLUMN "isContainer" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ItemType" t SET "isContainer" = true
WHERE EXISTS (SELECT 1 FROM "Item" i WHERE i."typeId" = t.id AND i."isContainer");

-- Items of a container type are single things. A record of such a type with
-- quantity N > 1 becomes N records of 1: the original keeps its place,
-- sticker and contents, the copies get the same place and own parameters.
CREATE TEMP TABLE item_copies ON COMMIT DROP AS
SELECT gen_random_uuid() AS new_id, i.id AS src_id
FROM "Item" i
JOIN "ItemType" t ON t.id = i."typeId"
CROSS JOIN LATERAL generate_series(2, i.quantity) g
WHERE t."isContainer" AND i.quantity > 1;

INSERT INTO "Item" ("id", "ownerId", "householdId", "typeId", "name", "quantity", "parentId",
	"homeId", "splitFromId", "takenById", "takenAt", "status", "archivedAt", "isWorkbench",
	"createdAt", "updatedAt")
SELECT c.new_id, i."ownerId", i."householdId", i."typeId", i."name", 1, i."parentId",
	i."homeId", i."splitFromId", i."takenById", i."takenAt", i."status", i."archivedAt", false,
	i."createdAt", CURRENT_TIMESTAMP
FROM item_copies c
JOIN "Item" i ON i.id = c.src_id;

CREATE TEMP TABLE param_copies ON COMMIT DROP AS
SELECT gen_random_uuid() AS new_id, p.id AS src_id, c.new_id AS item_id
FROM item_copies c
JOIN "Param" p ON p."itemId" = c.src_id;

INSERT INTO "Param" ("id", "defId", "itemId", "valueType", "position", "textValue", "numberValue",
	"numberMax", "unit", "dateValue", "boolValue", "fileKey", "fileName", "fileMime", "fileSize",
	"refItemId", "refTypeId", "dictionaryId", "createdAt", "updatedAt")
SELECT pc.new_id, p."defId", pc.item_id, p."valueType", p."position", p."textValue", p."numberValue",
	p."numberMax", p."unit", p."dateValue", p."boolValue", p."fileKey", p."fileName", p."fileMime",
	p."fileSize", p."refItemId", p."refTypeId", p."dictionaryId", p."createdAt", CURRENT_TIMESTAMP
FROM param_copies pc
JOIN "Param" p ON p.id = pc.src_id;

INSERT INTO "ParamEnumValue" ("paramId", "optionId")
SELECT pc.new_id, ev."optionId"
FROM param_copies pc
JOIN "ParamEnumValue" ev ON ev."paramId" = pc.src_id;

UPDATE "Item" SET "quantity" = 1 WHERE id IN (SELECT src_id FROM item_copies);

ALTER TABLE "Item" DROP CONSTRAINT "Item_container_single";
ALTER TABLE "Item" DROP COLUMN "isContainer";

-- ---------------------------------------------------------------------------
-- Units now live on the parameter (filled at the top, before copying).
-- ---------------------------------------------------------------------------
ALTER TABLE "Param" DROP COLUMN "unit";

-- ---------------------------------------------------------------------------
-- Every ENUM parameter owns its option list. A list shared by several
-- parameters is copied for all but the oldest one (options and chosen values
-- are remapped); lists no parameter uses are deleted. Lists take the name of
-- their parameter.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE dict_copies ON COMMIT DROP AS
SELECT gen_random_uuid() AS new_id, d."dictionaryId" AS src_id, d.id AS def_id
FROM (
	SELECT id, "dictionaryId",
		row_number() OVER (PARTITION BY "dictionaryId" ORDER BY "createdAt", id) AS rn
	FROM "ParamDef"
	WHERE "dictionaryId" IS NOT NULL
) d
WHERE d.rn > 1;

INSERT INTO "EnumDictionary" ("id", "ownerId", "householdId", "name", "multiple", "createdAt", "updatedAt")
SELECT c.new_id, e."ownerId", e."householdId", e."name", e."multiple", e."createdAt", CURRENT_TIMESTAMP
FROM dict_copies c
JOIN "EnumDictionary" e ON e.id = c.src_id;

CREATE TEMP TABLE option_copies ON COMMIT DROP AS
SELECT gen_random_uuid() AS new_id, o.id AS src_id, c.new_id AS dictionary_id, c.def_id
FROM dict_copies c
JOIN "EnumOption" o ON o."dictionaryId" = c.src_id;

INSERT INTO "EnumOption" ("id", "dictionaryId", "label", "position", "createdAt", "updatedAt")
SELECT oc.new_id, oc.dictionary_id, o."label", o."position", o."createdAt", CURRENT_TIMESTAMP
FROM option_copies oc
JOIN "EnumOption" o ON o.id = oc.src_id;

UPDATE "ParamEnumValue" ev SET "optionId" = oc.new_id
FROM option_copies oc, "Param" p
WHERE ev."optionId" = oc.src_id AND p.id = ev."paramId" AND p."defId" = oc.def_id;

UPDATE "Param" p SET "dictionaryId" = c.new_id
FROM dict_copies c
WHERE p."defId" = c.def_id;

UPDATE "ParamDef" d SET "dictionaryId" = c.new_id
FROM dict_copies c
WHERE d.id = c.def_id;

DELETE FROM "EnumDictionary" e
WHERE NOT EXISTS (SELECT 1 FROM "ParamDef" d WHERE d."dictionaryId" = e.id);

UPDATE "EnumDictionary" e SET "name" = d."name"
FROM "ParamDef" d
WHERE d."dictionaryId" = e.id;

-- CreateIndex
CREATE UNIQUE INDEX "ParamDef_dictionaryId_key" ON "ParamDef"("dictionaryId");

-- ---------------------------------------------------------------------------
-- Identical records lying in the same place merge into one with the summed
-- quantity: same owner, type, own name, place and own parameter values, not
-- a container, not on a workbench, without a sticker or contents and not
-- referenced by a parameter. The oldest record stays.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE twin_src ON COMMIT DROP AS
SELECT i.id, i.quantity, i."createdAt", i."ownerId", i."householdId", i."typeId",
	NULLIF(TRIM(i.name), '') AS name, i."parentId",
	COALESCE((
		SELECT string_agg(concat_ws('|', p."defId", p."textValue", p."numberValue", p."numberMax",
			p."dateValue", p."boolValue", p."fileKey", p."refItemId", p."refTypeId",
			(SELECT string_agg(ev."optionId"::text, ',' ORDER BY ev."optionId")
				FROM "ParamEnumValue" ev WHERE ev."paramId" = p.id)), ';' ORDER BY p."defId")
		FROM "Param" p WHERE p."itemId" = i.id
	), '') AS params
FROM "Item" i
JOIN "ItemType" t ON t.id = i."typeId"
WHERE i.status = 'ACTIVE' AND NOT i."isWorkbench" AND NOT t."isContainer"
	AND i."takenById" IS NULL
	AND NOT EXISTS (SELECT 1 FROM "Sticker" s WHERE s."itemId" = i.id)
	AND NOT EXISTS (SELECT 1 FROM "Item" c WHERE c."parentId" = i.id)
	AND NOT EXISTS (SELECT 1 FROM "Param" r WHERE r."refItemId" = i.id);

CREATE TEMP TABLE twins ON COMMIT DROP AS
SELECT id, quantity,
	first_value(id) OVER (
		PARTITION BY "ownerId", "householdId", "typeId", name, "parentId", params
		ORDER BY "createdAt", id
	) AS keep_id
FROM twin_src;

UPDATE "Item" i SET "quantity" = s.total
FROM (SELECT keep_id, sum(quantity) AS total FROM twins GROUP BY keep_id HAVING count(*) > 1) s
WHERE i.id = s.keep_id;

DELETE FROM "Item" WHERE id IN (SELECT id FROM twins WHERE id <> keep_id);
