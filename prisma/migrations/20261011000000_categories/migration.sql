-- Categories: required parameters for types and items (see docs/decisions.md, «Категории»).
-- CreateEnum
CREATE TYPE "ParamLevel" AS ENUM ('TYPE', 'ITEM');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryParam" (
    "categoryId" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "level" "ParamLevel" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryParam_pkey" PRIMARY KEY ("categoryId","defId")
);

-- CreateTable
CREATE TABLE "TypeCategory" (
    "typeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypeCategory_pkey" PRIMARY KEY ("typeId","categoryId")
);

-- CreateIndex
CREATE INDEX "Category_ownerId_idx" ON "Category"("ownerId");

-- CreateIndex
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");

-- CreateIndex
CREATE INDEX "CategoryParam_defId_idx" ON "CategoryParam"("defId");

-- CreateIndex
CREATE INDEX "TypeCategory_categoryId_idx" ON "TypeCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryParam" ADD CONSTRAINT "CategoryParam_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryParam" ADD CONSTRAINT "CategoryParam_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ParamDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeCategory" ADD CONSTRAINT "TypeCategory_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeCategory" ADD CONSTRAINT "TypeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one owner, like every catalog record.
ALTER TABLE "Category" ADD CONSTRAINT "Category_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
