-- Indexes for lookups that cascades and checks make by these columns
-- (a returned thing's home, split parts, references and files of parameters).
-- CreateIndex
CREATE INDEX "Item_homeId_idx" ON "Item"("homeId");

-- CreateIndex
CREATE INDEX "Item_splitFromId_idx" ON "Item"("splitFromId");

-- CreateIndex
CREATE INDEX "Param_refItemId_idx" ON "Param"("refItemId");

-- CreateIndex
CREATE INDEX "Param_refTypeId_idx" ON "Param"("refTypeId");

-- CreateIndex
CREATE INDEX "Param_fileKey_idx" ON "Param"("fileKey");

-- CreateIndex
CREATE INDEX "ParamEnumValue_optionId_idx" ON "ParamEnumValue"("optionId");


-- A record always holds at least one thing: using all of it archives the record
-- with its last quantity. The old check allowed 0.
UPDATE "Item" SET "quantity" = 1 WHERE "quantity" < 1;
ALTER TABLE "Item" DROP CONSTRAINT "Item_quantity_positive";
ALTER TABLE "Item" ADD CONSTRAINT "Item_quantity_positive" CHECK ("quantity" >= 1);
