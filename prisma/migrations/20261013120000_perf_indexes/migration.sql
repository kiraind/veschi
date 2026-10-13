-- CreateIndex
CREATE INDEX "HistoryEvent_ownerId_actorId_idx" ON "HistoryEvent"("ownerId", "actorId");

-- CreateIndex
CREATE INDEX "ItemType_photoKey_idx" ON "ItemType"("photoKey");

-- CreateIndex
CREATE INDEX "Param_dictionaryId_idx" ON "Param"("dictionaryId");

-- CreateIndex
CREATE INDEX "StickerBatch_ownerId_createdAt_idx" ON "StickerBatch"("ownerId", "createdAt");
