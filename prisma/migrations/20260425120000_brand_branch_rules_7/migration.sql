-- CreateEnum
CREATE TYPE "BrandSlotEntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "moderation_rejection_reason" TEXT,
ADD COLUMN     "moderation_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "moderation_reviewed_by_user_id" TEXT,
ADD COLUMN     "social_links" JSONB,
ADD COLUMN     "submitted_for_review_at" TIMESTAMP(3),
ADD COLUMN     "website_url" TEXT;

-- CreateTable
CREATE TABLE "BranchInteriorMedia" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BranchInteriorMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandSlotEntitlement" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "additional_slots" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "external_reference" TEXT,
    "status" "BrandSlotEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "granted_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSlotEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandRatingEligibility" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reservation_reference" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandRatingEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchInteriorMedia_branch_id_idx" ON "BranchInteriorMedia"("branch_id");

-- CreateIndex
CREATE INDEX "BranchInteriorMedia_media_id_idx" ON "BranchInteriorMedia"("media_id");

-- CreateIndex
CREATE INDEX "BrandSlotEntitlement_user_id_status_idx" ON "BrandSlotEntitlement"("user_id", "status");

-- CreateIndex
CREATE INDEX "BrandSlotEntitlement_granted_by_user_id_idx" ON "BrandSlotEntitlement"("granted_by_user_id");

-- CreateIndex
CREATE INDEX "BrandRatingEligibility_brand_id_user_id_idx" ON "BrandRatingEligibility"("brand_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandRatingEligibility_brand_id_user_id_reservation_referen_key" ON "BrandRatingEligibility"("brand_id", "user_id", "reservation_reference");

-- CreateIndex
CREATE INDEX "Brand_moderation_reviewed_by_user_id_idx" ON "Brand"("moderation_reviewed_by_user_id");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_moderation_reviewed_by_user_id_fkey" FOREIGN KEY ("moderation_reviewed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInteriorMedia" ADD CONSTRAINT "BranchInteriorMedia_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInteriorMedia" ADD CONSTRAINT "BranchInteriorMedia_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandSlotEntitlement" ADD CONSTRAINT "BrandSlotEntitlement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandSlotEntitlement" ADD CONSTRAINT "BrandSlotEntitlement_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRatingEligibility" ADD CONSTRAINT "BrandRatingEligibility_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRatingEligibility" ADD CONSTRAINT "BrandRatingEligibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
