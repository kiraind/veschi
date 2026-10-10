-- Review round 2 (see docs/decisions.md, «Вторая порция замечаний»).

-- ---------------------------------------------------------------------------
-- Containers are single things: quantity is always 1.
-- ---------------------------------------------------------------------------
UPDATE "Item" SET "quantity" = 1 WHERE ("isContainer" OR "isWorkbench") AND "quantity" <> 1;
ALTER TABLE "Item" ADD CONSTRAINT "Item_container_single" CHECK (NOT ("isContainer" OR "isWorkbench") OR "quantity" = 1);

-- ---------------------------------------------------------------------------
-- Photos belong to types. An item photo moves to its type when the type has
-- none (the most recently changed item wins); the other item photos are
-- dropped (their objects stay in storage).
-- ---------------------------------------------------------------------------
UPDATE "ItemType" t SET "photoKey" = s."photoKey"
FROM (
	SELECT DISTINCT ON ("typeId") "typeId", "photoKey"
	FROM "Item"
	WHERE "photoKey" IS NOT NULL AND "typeId" IS NOT NULL
	ORDER BY "typeId", "updatedAt" DESC
) s
WHERE t.id = s."typeId" AND t."photoKey" IS NULL;

ALTER TABLE "Item" DROP COLUMN "photoKey",
ADD COLUMN     "icon" TEXT;

-- ---------------------------------------------------------------------------
-- Parameter definitions. One definition per owner and case-insensitive key;
-- when one key was used with different value types or lists, the most used
-- variant keeps the name and the others get « (2)», « (3)»…
-- ---------------------------------------------------------------------------
CREATE TABLE "ParamDef" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "householdId" UUID,
    "name" TEXT NOT NULL,
    "valueType" "ParamValueType" NOT NULL,
    "dictionaryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParamDef_pkey" PRIMARY KEY ("id")
);

CREATE TEMP TABLE param_src ON COMMIT DROP AS
SELECT p.id AS param_id,
	COALESCE(t."ownerId", i."ownerId") AS owner_id,
	COALESCE(t."householdId", i."householdId") AS household_id,
	TRIM(p.key) AS key,
	lower(TRIM(p.key)) AS norm,
	p."valueType" AS value_type,
	p."dictionaryId" AS dictionary_id,
	p."createdAt" AS created_at
FROM "Param" p
LEFT JOIN "ItemType" t ON t.id = p."typeId"
LEFT JOIN "Item" i ON i.id = p."itemId";

CREATE TEMP TABLE param_defs ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, g.*,
	row_number() OVER (PARTITION BY owner_id, household_id, norm ORDER BY uses DESC, created_at) AS rn
FROM (
	SELECT owner_id, household_id, norm, value_type, dictionary_id,
		min(key) AS key, count(*) AS uses, min(created_at) AS created_at
	FROM param_src
	GROUP BY owner_id, household_id, norm, value_type, dictionary_id
) g;

INSERT INTO "ParamDef" ("id", "ownerId", "householdId", "name", "valueType", "dictionaryId", "createdAt", "updatedAt")
SELECT id, owner_id, household_id,
	CASE WHEN rn = 1 THEN key ELSE key || ' (' || rn || ')' END,
	value_type, dictionary_id, created_at, CURRENT_TIMESTAMP
FROM param_defs;

ALTER TABLE "Param" ADD COLUMN "defId" UUID;

UPDATE "Param" p SET "defId" = d.id
FROM param_src s
JOIN param_defs d ON d.owner_id IS NOT DISTINCT FROM s.owner_id
	AND d.household_id IS NOT DISTINCT FROM s.household_id
	AND d.norm = s.norm
	AND d.value_type = s.value_type
	AND d.dictionary_id IS NOT DISTINCT FROM s.dictionary_id
WHERE p.id = s.param_id;

ALTER TABLE "Param" DROP COLUMN "key",
ALTER COLUMN "defId" SET NOT NULL;

ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));

-- DropIndex
DROP INDEX "Param_itemId_idx";

-- DropIndex
DROP INDEX "Param_typeId_idx";

-- CreateIndex
CREATE INDEX "ParamDef_ownerId_idx" ON "ParamDef"("ownerId");

-- CreateIndex
CREATE INDEX "ParamDef_householdId_idx" ON "ParamDef"("householdId");

-- CreateIndex
CREATE INDEX "Param_defId_idx" ON "Param"("defId");

-- CreateIndex
CREATE UNIQUE INDEX "Param_typeId_defId_key" ON "Param"("typeId", "defId");

-- CreateIndex
CREATE UNIQUE INDEX "Param_itemId_defId_key" ON "Param"("itemId", "defId");

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "EnumDictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ParamDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
