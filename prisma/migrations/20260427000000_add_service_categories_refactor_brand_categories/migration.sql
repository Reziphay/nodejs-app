-- BrandCategory: rename unique index to match new key field name
ALTER INDEX "BrandCategory_name_key" RENAME TO "BrandCategory_key_key";

-- ServiceCategory already exists from db push — ensure idempotent
CREATE TABLE IF NOT EXISTS "ServiceCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceCategory_key_key" ON "ServiceCategory"("key");

-- Service: drop old category text column, add service_category_id relation
ALTER TABLE "Service" DROP COLUMN IF EXISTS "category";
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "service_category_id" TEXT;
CREATE INDEX IF NOT EXISTS "Service_service_category_id_idx" ON "Service"("service_category_id");
ALTER TABLE "Service" ADD CONSTRAINT "Service_service_category_id_fkey"
    FOREIGN KEY ("service_category_id") REFERENCES "ServiceCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
