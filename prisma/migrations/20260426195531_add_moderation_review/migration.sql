-- CreateEnum
CREATE TYPE "ModerationEntityType" AS ENUM ('brand', 'service');

-- CreateEnum
CREATE TYPE "ModerationOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ModerationReview" (
    "id" TEXT NOT NULL,
    "entity_type" "ModerationEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "outcome" "ModerationOutcome" NOT NULL,
    "rejection_reason" TEXT,
    "checklist" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationReview_entity_type_entity_id_idx" ON "ModerationReview"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ModerationReview_reviewer_id_idx" ON "ModerationReview"("reviewer_id");

-- AddForeignKey
ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
