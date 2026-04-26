-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_key_key" ON "ServiceCategory"("key");

-- AlterTable BrandCategory: rename name to key
ALTER TABLE "BrandCategory" RENAME COLUMN "name" TO "key";

-- DropIndex old unique on name (already renamed, constraint name stays)
ALTER TABLE "BrandCategory" RENAME CONSTRAINT "BrandCategory_name_key" TO "BrandCategory_key_key";

-- AlterTable Service
ALTER TABLE "Service" DROP COLUMN IF EXISTS "category";
ALTER TABLE "Service" ADD COLUMN "service_category_id" TEXT;

-- CreateIndex
CREATE INDEX "Service_service_category_id_idx" ON "Service"("service_category_id");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
