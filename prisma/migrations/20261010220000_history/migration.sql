-- CreateTable
CREATE TABLE "HistoryEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "householdId" TEXT,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "refIds" TEXT[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoryEvent_ownerId_createdAt_idx" ON "HistoryEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEvent_householdId_createdAt_idx" ON "HistoryEvent"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEvent_subjectId_idx" ON "HistoryEvent"("subjectId");

-- CreateIndex
CREATE INDEX "HistoryEvent_refIds_idx" ON "HistoryEvent" USING GIN ("refIds");

-- AddForeignKey
ALTER TABLE "HistoryEvent" ADD CONSTRAINT "HistoryEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEvent" ADD CONSTRAINT "HistoryEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEvent" ADD CONSTRAINT "HistoryEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one of ownerId / householdId, like every catalog record.
ALTER TABLE "HistoryEvent" ADD CONSTRAINT "HistoryEvent_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));

-- ---------------------------------------------------------------------------
-- Data: what the database already knows becomes history (nothing invented).
-- Creation of items, workbenches, types, parameters and sticker sheets at
-- their createdAt; archived items at archivedAt; items lying on a workbench
-- at takenAt. Older moves and edits were never recorded and are not made up.
-- The author is the owner (MVP records are personal), or who took the item.
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

-- Place reference as stored in event data: {id, name, kind}.
CREATE FUNCTION "veschi_tmp_place"(item_id TEXT) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', i.id,
    'name', COALESCE(NULLIF(btrim(i.name), ''), t.name, CASE WHEN i."isWorkbench" THEN '' ELSE 'Без названия' END),
    'kind', CASE WHEN i."isWorkbench" THEN 'workbench' ELSE 'item' END)
  FROM "Item" i LEFT JOIN "ItemType" t ON t.id = i."typeId"
  WHERE i.id = item_id
$$;

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), i."ownerId", i."householdId", i."ownerId",
  CASE WHEN i."isWorkbench" THEN 'workbench.created' ELSE 'item.created' END,
  CASE WHEN i."isWorkbench" THEN 'workbench' ELSE 'item' END,
  i.id,
  COALESCE(NULLIF(btrim(i.name), ''), t.name, CASE WHEN i."isWorkbench" THEN '' ELSE 'Без названия' END),
  CASE WHEN i."typeId" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[i."typeId"] END,
  '{"backfilled": true}'::JSONB,
  i."createdAt"
FROM "Item" i LEFT JOIN "ItemType" t ON t.id = i."typeId";

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), i."ownerId", i."householdId", i."ownerId", 'item.discarded', 'item', i.id,
  COALESCE(NULLIF(btrim(i.name), ''), t.name, 'Без названия'),
  CASE WHEN i."parentId" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[i."parentId"] END,
  jsonb_build_object('backfilled', true, 'quantity', i.quantity, 'from', "veschi_tmp_place"(i."parentId")),
  i."archivedAt"
FROM "Item" i LEFT JOIN "ItemType" t ON t.id = i."typeId"
WHERE i.status = 'ARCHIVED' AND i."archivedAt" IS NOT NULL AND NOT i."isWorkbench";

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), i."ownerId", i."householdId", i."takenById", 'item.taken', 'item', i.id,
  COALESCE(NULLIF(btrim(i.name), ''), t.name, 'Без названия'),
  array_remove(ARRAY[i."parentId", i."homeId"], NULL),
  jsonb_build_object('backfilled', true, 'quantity', i.quantity,
    'from', "veschi_tmp_place"(i."homeId"), 'to', "veschi_tmp_place"(i."parentId")),
  i."takenAt"
FROM "Item" i LEFT JOIN "ItemType" t ON t.id = i."typeId"
WHERE i.status = 'ACTIVE' AND i."takenById" IS NOT NULL AND i."takenAt" IS NOT NULL AND NOT i."isWorkbench";

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), "ownerId", "householdId", "ownerId", 'type.created', 'type', id, name,
  ARRAY[]::TEXT[], '{"backfilled": true}'::JSONB, "createdAt"
FROM "ItemType";

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), "ownerId", "householdId", "ownerId", 'paramDef.created', 'paramDef', id, name,
  ARRAY[]::TEXT[], '{"backfilled": true}'::JSONB, "createdAt"
FROM "ParamDef";

INSERT INTO "HistoryEvent" ("id", "ownerId", "householdId", "actorId", "kind", "subjectKind", "subjectId", "subjectName", "refIds", "data", "createdAt")
SELECT "veschi_tmp_cuid"(), b."ownerId", b."householdId", b."ownerId", 'stickers.issued', 'batch', b.id, 'Наклейки',
  ARRAY[]::TEXT[],
  jsonb_build_object('backfilled', true, 'count', (SELECT count(*) FROM "Sticker" s WHERE s."batchId" = b.id)),
  b."createdAt"
FROM "StickerBatch" b;

DROP FUNCTION "veschi_tmp_place"(TEXT);
DROP FUNCTION "veschi_tmp_cuid"();
