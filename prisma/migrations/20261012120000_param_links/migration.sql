-- Links (see docs/decisions.md, «Связи»): the value type «Вещь или тип» (REF)
-- becomes two, «Вещь» (ITEM) and «Тип» (TYPE). A link value may hold several
-- targets (ParamRef), and every link parameter has an inverse with its own
-- name («Содержит деталь» ↔ «Является деталью»): a value on A pointing at B
-- is mirrored by an inverse value on B pointing at A.
--
-- Existing data: each REF parameter becomes a link pointing at what its values
-- point at, living where its values live. Its inverse is named
-- «<название> (обратно)» (renamed later on the «Параметры» page) and gets the
-- mirrored values. A parameter used both on items and on types, or pointing
-- both at items and at types, is split: the first such combination keeps the
-- parameter, each other one becomes a new parameter «<название> (тип → вещь)».
-- Values whose target was deleted (shown as «удалено») are dropped. A REF
-- parameter with no values becomes a link between items.

-- New tables and columns ------------------------------------------------------

CREATE TABLE "ParamRef" (
    "id" TEXT NOT NULL,
    "paramId" TEXT NOT NULL,
    "itemId" TEXT,
    "typeId" TEXT,

    CONSTRAINT "ParamRef_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParamRef_itemId_idx" ON "ParamRef"("itemId");
CREATE INDEX "ParamRef_typeId_idx" ON "ParamRef"("typeId");
CREATE UNIQUE INDEX "ParamRef_paramId_itemId_key" ON "ParamRef"("paramId", "itemId");
CREATE UNIQUE INDEX "ParamRef_paramId_typeId_key" ON "ParamRef"("paramId", "typeId");
ALTER TABLE "ParamRef" ADD CONSTRAINT "ParamRef_target_xor" CHECK (("itemId" IS NULL) <> ("typeId" IS NULL));

ALTER TABLE "ParamDef" ADD COLUMN "inverseId" TEXT;

-- Value types as text while the data moves.
ALTER TABLE "ParamDef" ALTER COLUMN "valueType" TYPE TEXT;
ALTER TABLE "Param" ALTER COLUMN "valueType" TYPE TEXT;

-- Data -------------------------------------------------------------------------

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

-- `base`, or `base 2`, `base 3`… — the first name no parameter of the owner has.
CREATE FUNCTION "veschi_tmp_free_name"(base TEXT, owner TEXT, household TEXT) RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  candidate TEXT := base;
  n INT := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM "ParamDef" d
    WHERE lower(btrim(d.name)) = lower(btrim(candidate))
      AND d."ownerId" IS NOT DISTINCT FROM owner
      AND d."householdId" IS NOT DISTINCT FROM household
  ) LOOP
    n := n + 1;
    candidate := base || ' ' || n;
  END LOOP;
  RETURN candidate;
END
$$;

DELETE FROM "Param" WHERE "valueType" = 'REF' AND "refItemId" IS NULL AND "refTypeId" IS NULL;

-- Links after the split: (parameter, its name, where it lives, what it points at).
CREATE TEMP TABLE "veschi_tmp_links" (def_id TEXT, name TEXT, holder TEXT, target TEXT);

DO $$
DECLARE
  d RECORD;
  g RECORD;
  first BOOLEAN;
  fwd TEXT;
  fwd_name TEXT;
BEGIN
  FOR d IN SELECT * FROM "ParamDef" WHERE "valueType" = 'REF' ORDER BY "createdAt" LOOP
    first := TRUE;
    FOR g IN
      SELECT holder, target FROM (
        SELECT
          CASE WHEN p."itemId" IS NOT NULL THEN 'ITEM' ELSE 'TYPE' END AS holder,
          CASE WHEN p."refItemId" IS NOT NULL THEN 'ITEM' ELSE 'TYPE' END AS target,
          count(*) AS n
        FROM "Param" p WHERE p."defId" = d.id
        GROUP BY 1, 2
        UNION ALL
        -- No values: a link between items.
        SELECT 'ITEM', 'ITEM', 0 WHERE NOT EXISTS (SELECT 1 FROM "Param" p WHERE p."defId" = d.id)
      ) groups
      ORDER BY n DESC, holder, target
    LOOP
      IF first THEN
        fwd := d.id;
        fwd_name := d.name;
      ELSE
        fwd := "veschi_tmp_cuid"();
        fwd_name := "veschi_tmp_free_name"(
          d.name || ' (' || CASE g.holder WHEN 'ITEM' THEN 'вещь' ELSE 'тип' END
            || ' → ' || CASE g.target WHEN 'ITEM' THEN 'вещь' ELSE 'тип' END || ')',
          d."ownerId", d."householdId");
        INSERT INTO "ParamDef" (id, "ownerId", "householdId", name, "valueType", "createdAt", "updatedAt")
        VALUES (fwd, d."ownerId", d."householdId", fwd_name, 'REF', d."createdAt", now());
        UPDATE "Param" p SET "defId" = fwd
        WHERE p."defId" = d.id
          AND (CASE WHEN p."itemId" IS NOT NULL THEN 'ITEM' ELSE 'TYPE' END) = g.holder
          AND (CASE WHEN p."refItemId" IS NOT NULL THEN 'ITEM' ELSE 'TYPE' END) = g.target;
        -- Categories require the parameter where its values are.
        INSERT INTO "CategoryParam" ("categoryId", "defId", level, position)
        SELECT cp."categoryId", fwd, cp.level, cp.position FROM "CategoryParam" cp
        WHERE cp."defId" = d.id AND cp.level::text = g.holder
          AND NOT EXISTS (SELECT 1 FROM "veschi_tmp_links" l WHERE l.def_id = d.id AND l.holder = g.holder);
        DELETE FROM "CategoryParam" cp WHERE cp."defId" = d.id AND cp.level::text = g.holder
          AND NOT EXISTS (SELECT 1 FROM "veschi_tmp_links" l WHERE l.def_id = d.id AND l.holder = g.holder);
      END IF;
      first := FALSE;
      INSERT INTO "veschi_tmp_links" VALUES (fwd, fwd_name, g.holder, g.target);
    END LOOP;
  END LOOP;
END
$$;

DO $$
DECLARE
  l RECORD;
  inv TEXT;
BEGIN
  FOR l IN SELECT * FROM "veschi_tmp_links" LOOP
    inv := "veschi_tmp_cuid"();
    INSERT INTO "ParamDef" (id, "ownerId", "householdId", name, "valueType", "inverseId", "createdAt", "updatedAt")
    SELECT inv, d."ownerId", d."householdId",
      "veschi_tmp_free_name"(l.name || ' (обратно)', d."ownerId", d."householdId"),
      l.holder, l.def_id, d."createdAt", now()
    FROM "ParamDef" d WHERE d.id = l.def_id;
    UPDATE "ParamDef" SET "valueType" = l.target, "inverseId" = inv WHERE id = l.def_id;

    UPDATE "Param" SET "valueType" = l.target WHERE "defId" = l.def_id;
    INSERT INTO "ParamRef" (id, "paramId", "itemId", "typeId")
    SELECT "veschi_tmp_cuid"(), p.id, p."refItemId", p."refTypeId" FROM "Param" p WHERE p."defId" = l.def_id;

    -- The mirrored values: one per target, at the end of its list.
    INSERT INTO "Param" (id, "defId", "itemId", "typeId", "valueType", position, "createdAt", "updatedAt")
    SELECT "veschi_tmp_cuid"(), inv, t."refItemId", t."refTypeId", l.holder,
      COALESCE((SELECT max(o.position) + 1 FROM "Param" o
        WHERE (t."refItemId" IS NOT NULL AND o."itemId" = t."refItemId")
           OR (t."refTypeId" IS NOT NULL AND o."typeId" = t."refTypeId")), 0),
      now(), now()
    FROM (SELECT DISTINCT p."refItemId", p."refTypeId" FROM "Param" p WHERE p."defId" = l.def_id) t;
    INSERT INTO "ParamRef" (id, "paramId", "itemId", "typeId")
    SELECT "veschi_tmp_cuid"(), m.id, p."itemId", p."typeId"
    FROM "Param" p
    JOIN "Param" m ON m."defId" = inv
      AND m."itemId" IS NOT DISTINCT FROM p."refItemId"
      AND m."typeId" IS NOT DISTINCT FROM p."refTypeId"
    WHERE p."defId" = l.def_id;
  END LOOP;
END
$$;

DROP TABLE "veschi_tmp_links";

-- Required at a level where a link cannot live: nothing can fill it.
DELETE FROM "CategoryParam" cp USING "ParamDef" d, "ParamDef" i
WHERE cp."defId" = d.id AND i.id = d."inverseId" AND cp.level::text <> i."valueType";

DROP FUNCTION "veschi_tmp_free_name"(TEXT, TEXT, TEXT);
DROP FUNCTION "veschi_tmp_cuid"();

-- Old columns and the new value types -------------------------------------------

ALTER TABLE "Param" DROP CONSTRAINT "Param_refItemId_fkey";
ALTER TABLE "Param" DROP CONSTRAINT "Param_refTypeId_fkey";
DROP INDEX "Param_refItemId_idx";
DROP INDEX "Param_refTypeId_idx";
ALTER TABLE "Param" DROP COLUMN "refItemId", DROP COLUMN "refTypeId";

DROP TYPE "ParamValueType";
CREATE TYPE "ParamValueType" AS ENUM ('STRING', 'NUMBER', 'RANGE', 'ENUM', 'URL', 'FILE', 'DATE', 'BOOLEAN', 'ITEM', 'TYPE');
ALTER TABLE "ParamDef" ALTER COLUMN "valueType" TYPE "ParamValueType" USING ("valueType"::"ParamValueType");
ALTER TABLE "Param" ALTER COLUMN "valueType" TYPE "ParamValueType" USING ("valueType"::"ParamValueType");

CREATE UNIQUE INDEX "ParamDef_inverseId_key" ON "ParamDef"("inverseId");
ALTER TABLE "ParamDef" ADD CONSTRAINT "ParamDef_inverseId_fkey" FOREIGN KEY ("inverseId") REFERENCES "ParamDef"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ParamRef" ADD CONSTRAINT "ParamRef_paramId_fkey" FOREIGN KEY ("paramId") REFERENCES "Param"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParamRef" ADD CONSTRAINT "ParamRef_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParamRef" ADD CONSTRAINT "ParamRef_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
