-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('FREE', 'BOUND', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ParamValueType" AS ENUM ('STRING', 'NUMBER', 'RANGE', 'ENUM', 'URL', 'FILE', 'DATE', 'REF', 'BOOLEAN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastWorkbenchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","householdId")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemType" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "householdId" UUID,
    "name" TEXT NOT NULL,
    "photoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "householdId" UUID,
    "typeId" UUID,
    "name" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "parentId" UUID,
    "homeId" UUID,
    "splitFromId" UUID,
    "takenById" UUID,
    "takenAt" TIMESTAMP(3),
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "isWorkbench" BOOLEAN NOT NULL DEFAULT false,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "geoRadiusM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerBatch" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "householdId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" UUID NOT NULL,
    "code" CHAR(6) NOT NULL,
    "caption" TEXT,
    "status" "StickerStatus" NOT NULL DEFAULT 'FREE',
    "itemId" UUID,
    "batchId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "ownerId" UUID,
    "householdId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnumDictionary" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "householdId" UUID,
    "name" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnumDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnumOption" (
    "id" UUID NOT NULL,
    "dictionaryId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnumOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Param" (
    "id" UUID NOT NULL,
    "typeId" UUID,
    "itemId" UUID,
    "key" TEXT NOT NULL,
    "valueType" "ParamValueType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "numberMax" DOUBLE PRECISION,
    "unit" TEXT,
    "dateValue" DATE,
    "boolValue" BOOLEAN,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "refItemId" UUID,
    "refTypeId" UUID,
    "dictionaryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Param_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParamEnumValue" (
    "paramId" UUID NOT NULL,
    "optionId" UUID NOT NULL,

    CONSTRAINT "ParamEnumValue_pkey" PRIMARY KEY ("paramId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ItemType_ownerId_idx" ON "ItemType"("ownerId");

-- CreateIndex
CREATE INDEX "ItemType_householdId_idx" ON "ItemType"("householdId");

-- CreateIndex
CREATE INDEX "Item_ownerId_status_idx" ON "Item"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Item_householdId_status_idx" ON "Item"("householdId", "status");

-- CreateIndex
CREATE INDEX "Item_parentId_idx" ON "Item"("parentId");

-- CreateIndex
CREATE INDEX "Item_typeId_idx" ON "Item"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_code_key" ON "Sticker"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_itemId_key" ON "Sticker"("itemId");

-- CreateIndex
CREATE INDEX "Sticker_ownerId_status_idx" ON "Sticker"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Sticker_batchId_idx" ON "Sticker"("batchId");

-- CreateIndex
CREATE INDEX "EnumDictionary_ownerId_idx" ON "EnumDictionary"("ownerId");

-- CreateIndex
CREATE INDEX "EnumOption_dictionaryId_position_idx" ON "EnumOption"("dictionaryId", "position");

-- CreateIndex
CREATE INDEX "Param_typeId_idx" ON "Param"("typeId");

-- CreateIndex
CREATE INDEX "Param_itemId_idx" ON "Param"("itemId");

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

-- Ownership: a record is personal (ownerId) or shared (householdId), exactly one of the two.
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
ALTER TABLE "Item" ADD CONSTRAINT "Item_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));
ALTER TABLE "EnumDictionary" ADD CONSTRAINT "EnumDictionary_owner_xor" CHECK (("ownerId" IS NULL) <> ("householdId" IS NULL));

-- A parameter belongs to a type or to an item, exactly one of the two.
ALTER TABLE "Param" ADD CONSTRAINT "Param_target_xor" CHECK (("typeId" IS NULL) <> ("itemId" IS NULL));

-- Items: non-negative quantity, a non-workbench item always has a type, an item is never its own parent.
ALTER TABLE "Item" ADD CONSTRAINT "Item_quantity_positive" CHECK ("quantity" >= 0);
ALTER TABLE "Item" ADD CONSTRAINT "Item_type_required" CHECK ("isWorkbench" OR "typeId" IS NOT NULL);
ALTER TABLE "Item" ADD CONSTRAINT "Item_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Sticker codes: 6 characters of the ID alphabet (no 0, O, 1, I, L).
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_code_format" CHECK ("code" ~ '^[2-9A-HJKMNP-Z]{6}$');
