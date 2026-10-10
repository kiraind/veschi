-- Review round 4: ids are cuids (TEXT) instead of UUIDs. Every existing row
-- gets a new cuid; foreign keys follow through ON UPDATE CASCADE. Old item,
-- type and parameter ids are kept in "LegacyId" so old links redirect.
-- Sticker QR codes hold the sticker code, not an id, so printed stickers are
-- not affected. Also: an item with a sticker is a single thing, so records
-- with a sticker and quantity > 1 are split into the stickered one (1) and a
-- plain record with the rest.

-- DropForeignKey
ALTER TABLE "EnumDictionary" DROP CONSTRAINT "EnumDictionary_householdId_fkey";

-- DropForeignKey
ALTER TABLE "EnumDictionary" DROP CONSTRAINT "EnumDictionary_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EnumOption" DROP CONSTRAINT "EnumOption_dictionaryId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_householdId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_homeId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_householdId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_splitFromId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_takenById_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_typeId_fkey";

-- DropForeignKey
ALTER TABLE "ItemType" DROP CONSTRAINT "ItemType_householdId_fkey";

-- DropForeignKey
ALTER TABLE "ItemType" DROP CONSTRAINT "ItemType_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_householdId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_defId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_dictionaryId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_itemId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_refItemId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_refTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Param" DROP CONSTRAINT "Param_typeId_fkey";

-- DropForeignKey
ALTER TABLE "ParamDef" DROP CONSTRAINT "ParamDef_dictionaryId_fkey";

-- DropForeignKey
ALTER TABLE "ParamDef" DROP CONSTRAINT "ParamDef_householdId_fkey";

-- DropForeignKey
ALTER TABLE "ParamDef" DROP CONSTRAINT "ParamDef_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "ParamEnumValue" DROP CONSTRAINT "ParamEnumValue_optionId_fkey";

-- DropForeignKey
ALTER TABLE "ParamEnumValue" DROP CONSTRAINT "ParamEnumValue_paramId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "Sticker" DROP CONSTRAINT "Sticker_batchId_fkey";

-- DropForeignKey
ALTER TABLE "Sticker" DROP CONSTRAINT "Sticker_householdId_fkey";

-- DropForeignKey
ALTER TABLE "Sticker" DROP CONSTRAINT "Sticker_itemId_fkey";

-- DropForeignKey
ALTER TABLE "Sticker" DROP CONSTRAINT "Sticker_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "StickerBatch" DROP CONSTRAINT "StickerBatch_householdId_fkey";

-- DropForeignKey
ALTER TABLE "StickerBatch" DROP CONSTRAINT "StickerBatch_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_lastWorkbenchId_fkey";

-- AlterTable
ALTER TABLE "EnumDictionary" DROP CONSTRAINT "EnumDictionary_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "EnumDictionary_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EnumOption" DROP CONSTRAINT "EnumOption_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "dictionaryId" SET DATA TYPE TEXT,
ADD CONSTRAINT "EnumOption_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Household" DROP CONSTRAINT "Household_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Household_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Item" DROP CONSTRAINT "Item_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ALTER COLUMN "typeId" SET DATA TYPE TEXT,
ALTER COLUMN "parentId" SET DATA TYPE TEXT,
ALTER COLUMN "homeId" SET DATA TYPE TEXT,
ALTER COLUMN "splitFromId" SET DATA TYPE TEXT,
ALTER COLUMN "takenById" SET DATA TYPE TEXT,
ADD CONSTRAINT "Item_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ItemType" DROP CONSTRAINT "ItemType_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_pkey",
ALTER COLUMN "userId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId", "householdId");

-- AlterTable
ALTER TABLE "Param" DROP CONSTRAINT "Param_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "typeId" SET DATA TYPE TEXT,
ALTER COLUMN "itemId" SET DATA TYPE TEXT,
ALTER COLUMN "refItemId" SET DATA TYPE TEXT,
ALTER COLUMN "refTypeId" SET DATA TYPE TEXT,
ALTER COLUMN "dictionaryId" SET DATA TYPE TEXT,
ALTER COLUMN "defId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Param_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ParamDef" DROP CONSTRAINT "ParamDef_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ALTER COLUMN "dictionaryId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ParamDef_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ParamEnumValue" DROP CONSTRAINT "ParamEnumValue_pkey",
ALTER COLUMN "paramId" SET DATA TYPE TEXT,
ALTER COLUMN "optionId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ParamEnumValue_pkey" PRIMARY KEY ("paramId", "optionId");

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Sticker" DROP CONSTRAINT "Sticker_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "itemId" SET DATA TYPE TEXT,
ALTER COLUMN "batchId" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "StickerBatch" DROP CONSTRAINT "StickerBatch_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ownerId" SET DATA TYPE TEXT,
ALTER COLUMN "householdId" SET DATA TYPE TEXT,
ADD CONSTRAINT "StickerBatch_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "lastWorkbenchId" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "LegacyId" (
    "oldId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "newId" TEXT NOT NULL,

    CONSTRAINT "LegacyId_pkey" PRIMARY KEY ("oldId")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lastWorkbenchId_fkey" FOREIGN KEY ("lastWorkbenchId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_splitFromId_fkey" FOREIGN KEY ("splitFromId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StickerBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnumDictionary" ADD CONSTRAINT "EnumDictionary_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnumDictionary" ADD CONSTRAINT "EnumDictionary_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnumOption" ADD CONSTRAINT "EnumOption_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "EnumDictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "EnumDictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ParamDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_refItemId_fkey" FOREIGN KEY ("refItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_refTypeId_fkey" FOREIGN KEY ("refTypeId") REFERENCES "ItemType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Param" ADD CONSTRAINT "Param_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "EnumDictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamEnumValue" ADD CONSTRAINT "ParamEnumValue_paramId_fkey" FOREIGN KEY ("paramId") REFERENCES "Param"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamEnumValue" ADD CONSTRAINT "ParamEnumValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EnumOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data: new cuid ids
-- ---------------------------------------------------------------------------

-- A cuid-shaped id: "c", 8 base36 chars of the time in ms, 16 random base36 chars.
CREATE FUNCTION "veschi_tmp_cuid"() RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789abcdefghijklmnopqrstuvwxyz';
  ts BIGINT := floor(extract(epoch FROM clock_timestamp()) * 1000);
  head TEXT := '';
  tail TEXT := '';
BEGIN
  WHILE ts > 0 LOOP
    head := substr(alphabet, (ts % 36)::INT + 1, 1) || head;
    ts := ts / 36;
  END LOOP;
  FOR i IN 1..16 LOOP
    tail := tail || substr(alphabet, floor(random() * 36)::INT + 1, 1);
  END LOOP;
  RETURN 'c' || lpad(head, 8, '0') || tail;
END
$$;

CREATE TABLE "veschi_tmp_id_map" ("model" TEXT NOT NULL, "oldId" TEXT NOT NULL, "newId" TEXT NOT NULL);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['User', 'Household', 'Invitation', 'ItemType', 'Item', 'StickerBatch',
    'Sticker', 'EnumDictionary', 'EnumOption', 'ParamDef', 'Param']
  LOOP
    EXECUTE format('INSERT INTO "veschi_tmp_id_map" SELECT %L, id, "veschi_tmp_cuid"() FROM %I', t, t);
    EXECUTE format(
      'UPDATE %I r SET id = m."newId" FROM "veschi_tmp_id_map" m WHERE m."model" = %L AND m."oldId" = r.id',
      t, t);
  END LOOP;
END
$$;

INSERT INTO "LegacyId" ("oldId", "model", "newId")
SELECT "oldId", "model", "newId" FROM "veschi_tmp_id_map"
WHERE "model" IN ('Item', 'ItemType', 'ParamDef');

DROP TABLE "veschi_tmp_id_map";

-- ---------------------------------------------------------------------------
-- Data: a stickered record holds one thing
-- ---------------------------------------------------------------------------

CREATE TABLE "veschi_tmp_split" AS
SELECT i.id AS "srcId", "veschi_tmp_cuid"() AS "newId"
FROM "Item" i JOIN "Sticker" s ON s."itemId" = i.id
WHERE i.quantity > 1;

INSERT INTO "Item" (id, "ownerId", "householdId", "typeId", name, quantity, "parentId", "homeId",
  "splitFromId", "takenById", "takenAt", status, "archivedAt", "isWorkbench", "geoLat", "geoLng",
  "geoRadiusM", icon, "createdAt", "updatedAt")
SELECT s."newId", i."ownerId", i."householdId", i."typeId", i.name, i.quantity - 1, i."parentId",
  i."homeId", i."splitFromId", i."takenById", i."takenAt", i.status, i."archivedAt", i."isWorkbench",
  i."geoLat", i."geoLng", i."geoRadiusM", i.icon, i."createdAt", CURRENT_TIMESTAMP
FROM "veschi_tmp_split" s JOIN "Item" i ON i.id = s."srcId";

-- Own parameter values go with the split-off part.
CREATE TABLE "veschi_tmp_param_split" AS
SELECT p.id AS "srcId", "veschi_tmp_cuid"() AS "newId", s."newId" AS "itemId"
FROM "Param" p JOIN "veschi_tmp_split" s ON p."itemId" = s."srcId";

INSERT INTO "Param" (id, "defId", "typeId", "itemId", "valueType", position, "textValue",
  "numberValue", "numberMax", "dateValue", "boolValue", "fileKey", "fileName", "fileMime",
  "fileSize", "refItemId", "refTypeId", "dictionaryId", "createdAt", "updatedAt")
SELECT c."newId", p."defId", NULL, c."itemId", p."valueType", p.position, p."textValue",
  p."numberValue", p."numberMax", p."dateValue", p."boolValue", p."fileKey", p."fileName",
  p."fileMime", p."fileSize", p."refItemId", p."refTypeId", p."dictionaryId", p."createdAt",
  CURRENT_TIMESTAMP
FROM "veschi_tmp_param_split" c JOIN "Param" p ON p.id = c."srcId";

INSERT INTO "ParamEnumValue" ("paramId", "optionId")
SELECT c."newId", v."optionId"
FROM "veschi_tmp_param_split" c JOIN "ParamEnumValue" v ON v."paramId" = c."srcId";

UPDATE "Item" i SET quantity = 1 FROM "veschi_tmp_split" s WHERE i.id = s."srcId";

DROP TABLE "veschi_tmp_param_split";
DROP TABLE "veschi_tmp_split";
DROP FUNCTION "veschi_tmp_cuid"();
