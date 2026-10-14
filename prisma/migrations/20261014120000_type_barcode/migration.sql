-- Packaging barcode of a type (see docs/decisions.md, «Штрихкоды»).
-- AlterTable
ALTER TABLE "ItemType" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_ownerId_barcode_key" ON "ItemType"("ownerId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_householdId_barcode_key" ON "ItemType"("householdId", "barcode");

