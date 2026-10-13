-- Packaging barcodes of types (see docs/decisions.md, «Штрихкоды»).
-- CreateTable
CREATE TABLE "TypeBarcode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "ownerId" TEXT,
    "householdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypeBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TypeBarcode_typeId_idx" ON "TypeBarcode"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "TypeBarcode_ownerId_code_key" ON "TypeBarcode"("ownerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TypeBarcode_householdId_code_key" ON "TypeBarcode"("householdId", "code");

-- AddForeignKey
ALTER TABLE "TypeBarcode" ADD CONSTRAINT "TypeBarcode_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeBarcode" ADD CONSTRAINT "TypeBarcode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeBarcode" ADD CONSTRAINT "TypeBarcode_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one of ownerId / householdId, like every catalog record.
ALTER TABLE "TypeBarcode" ADD CONSTRAINT "TypeBarcode_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
