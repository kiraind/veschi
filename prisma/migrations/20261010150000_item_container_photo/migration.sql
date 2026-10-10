-- AlterTable
ALTER TABLE "Item" ADD COLUMN "isContainer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photoKey" TEXT;

-- Existing workbenches and every item something was put into or taken from become containers.
UPDATE "Item" i SET "isContainer" = true
WHERE i."isWorkbench"
	OR EXISTS (SELECT 1 FROM "Item" c WHERE c."parentId" = i.id)
	OR EXISTS (SELECT 1 FROM "Item" c WHERE c."homeId" = i.id);
