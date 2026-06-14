-- BrandCategory: rename name -> key
ALTER TABLE "BrandCategory" RENAME COLUMN "name" TO "key";
ALTER INDEX "BrandCategory_name_key" RENAME TO "BrandCategory_key_key";

-- ServiceCategory
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceCategory_key_key" ON "ServiceCategory"("key");

-- Service: drop category text, add service_category_id relation
ALTER TABLE "Service" DROP COLUMN "category";
ALTER TABLE "Service" ADD COLUMN "service_category_id" TEXT;
CREATE INDEX "Service_service_category_id_idx" ON "Service"("service_category_id");
ALTER TABLE "Service" ADD CONSTRAINT "Service_service_category_id_fkey"
    FOREIGN KEY ("service_category_id") REFERENCES "ServiceCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
