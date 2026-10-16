-- CreateEnum
CREATE TYPE "PhotoChoice" AS ENUM ('AUTO', 'ORIGINAL', 'CUTOUT');

-- CreateEnum
CREATE TYPE "PhotoStage" AS ENUM ('CUTOUT');

-- CreateEnum
CREATE TYPE "PhotoJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ItemType" ADD COLUMN     "photoChoice" "PhotoChoice" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "photoCutoutKey" TEXT,
ADD COLUMN     "photoOriginalKey" TEXT,
ADD COLUMN     "photoSourceKey" TEXT;

-- CreateTable
CREATE TABLE "PhotoJob" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "stage" "PhotoStage" NOT NULL,
    "status" "PhotoJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhotoJob_status_runAfter_idx" ON "PhotoJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "PhotoJob_typeId_idx" ON "PhotoJob"("typeId");

-- CreateIndex
CREATE INDEX "ItemType_photoOriginalKey_idx" ON "ItemType"("photoOriginalKey");

-- CreateIndex
CREATE INDEX "ItemType_photoCutoutKey_idx" ON "ItemType"("photoCutoutKey");

-- AddForeignKey
ALTER TABLE "PhotoJob" ADD CONSTRAINT "PhotoJob_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing photos become the original version (they are not recomputed here:
-- the worker backfills them once processing is turned on).
UPDATE "ItemType" SET "photoOriginalKey" = "photoKey" WHERE "photoKey" IS NOT NULL;
