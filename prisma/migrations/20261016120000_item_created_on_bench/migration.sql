-- Items created right on a workbench and not put anywhere since («Откуда: новая»).
ALTER TABLE "Item" ADD COLUMN "createdOnBench" BOOLEAN NOT NULL DEFAULT false;

-- Existing ones: lying on a bench with no home, created there and never taken.
UPDATE "Item" i SET "createdOnBench" = true
WHERE i."takenById" IS NOT NULL AND i."homeId" IS NULL AND i."splitFromId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "HistoryEvent" e WHERE e.kind = 'item.created' AND e."subjectId" = i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "HistoryEvent" e WHERE e.kind = 'item.taken' AND e.data->>'resultId' = i.id
  );
