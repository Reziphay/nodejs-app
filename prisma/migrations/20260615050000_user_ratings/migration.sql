-- Drop the reverted auto_paused column (feature was abandoned).
ALTER TABLE "Service" DROP COLUMN IF EXISTS "auto_paused";

-- CreateEnum
CREATE TYPE "UserRatingKind" AS ENUM ('PROVIDER', 'CUSTOMER');

-- CreateTable
CREATE TABLE "UserRating" (
    "id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "rater_user_id" TEXT NOT NULL,
    "kind" "UserRatingKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_target_user_id_rater_user_id_kind_key" ON "UserRating"("target_user_id", "rater_user_id", "kind");

-- CreateIndex
CREATE INDEX "UserRating_target_user_id_kind_idx" ON "UserRating"("target_user_id", "kind");

-- CreateIndex
CREATE INDEX "UserRating_rater_user_id_idx" ON "UserRating"("rater_user_id");

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_rater_user_id_fkey" FOREIGN KEY ("rater_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
