-- Stickers 20 or 40 mm wide (see docs/decisions.md, «Наклейки 40 мм»).
ALTER TABLE "Item" ADD COLUMN "stickerOrderWidth" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Sticker" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 20;
