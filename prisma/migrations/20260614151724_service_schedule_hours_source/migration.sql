/*
  Warnings:

  - You are about to drop the `ProviderSchedule` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "HoursSource" AS ENUM ('CUSTOM', 'BRANCH');

-- DropForeignKey
ALTER TABLE "ProviderSchedule" DROP CONSTRAINT "ProviderSchedule_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "ProviderSchedule" DROP CONSTRAINT "ProviderSchedule_provider_user_id_fkey";

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "hours_source" "HoursSource" NOT NULL DEFAULT 'CUSTOM';

-- DropTable
DROP TABLE "ProviderSchedule";

-- CreateTable
CREATE TABLE "ServiceSchedule" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,

    CONSTRAINT "ServiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSchedule_service_id_weekday_idx" ON "ServiceSchedule"("service_id", "weekday");

-- CreateIndex
CREATE INDEX "Service_branch_id_idx" ON "Service"("branch_id");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
