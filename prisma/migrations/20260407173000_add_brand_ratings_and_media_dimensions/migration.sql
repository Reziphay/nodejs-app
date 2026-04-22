-- AlterTable
ALTER TABLE "Media"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

-- CreateTable
CREATE TABLE "BrandRating" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandRating_brand_id_user_id_key" ON "BrandRating"("brand_id", "user_id");

-- CreateIndex
CREATE INDEX "BrandRating_brand_id_idx" ON "BrandRating"("brand_id");

-- CreateIndex
CREATE INDEX "BrandRating_user_id_idx" ON "BrandRating"("user_id");

-- AddForeignKey
ALTER TABLE "BrandRating"
ADD CONSTRAINT "BrandRating_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRating"
ADD CONSTRAINT "BrandRating_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
