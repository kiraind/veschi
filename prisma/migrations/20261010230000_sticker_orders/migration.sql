-- Sticker orders and unprinted batches (see docs/decisions.md, «Заказ наклеек»).
ALTER TABLE "Item" ADD COLUMN "stickerOrderedAt" TIMESTAMP(3);
ALTER TABLE "Sticker" ADD COLUMN "fromOrder" BOOLEAN NOT NULL DEFAULT false;
