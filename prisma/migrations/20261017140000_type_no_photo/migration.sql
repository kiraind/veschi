-- «Фото не нужно»: the type's card collapses the photo area while there is no photo.
ALTER TABLE "ItemType" ADD COLUMN "noPhoto" BOOLEAN NOT NULL DEFAULT false;
