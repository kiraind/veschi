-- Collections: named lists of things and their quantities (see docs/decisions.md, «Коллекции»).
-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionEntry" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "typeId" TEXT,
    "itemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_ownerId_idx" ON "Collection"("ownerId");

-- CreateIndex
CREATE INDEX "Collection_householdId_idx" ON "Collection"("householdId");

-- CreateIndex
CREATE INDEX "CollectionEntry_typeId_idx" ON "CollectionEntry"("typeId");

-- CreateIndex
CREATE INDEX "CollectionEntry_itemId_idx" ON "CollectionEntry"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionEntry_collectionId_typeId_key" ON "CollectionEntry"("collectionId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionEntry_collectionId_itemId_key" ON "CollectionEntry"("collectionId", "itemId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One target per entry, a positive quantity, one owner per collection.
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_one_target" CHECK (("typeId" IS NULL) <> ("itemId" IS NULL));
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_quantity_positive" CHECK ("quantity" >= 1);
