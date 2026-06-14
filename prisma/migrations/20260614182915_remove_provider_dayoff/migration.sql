/*
  Warnings:

  - You are about to drop the `ProviderDayOff` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProviderDayOff" DROP CONSTRAINT "ProviderDayOff_provider_user_id_fkey";

-- DropTable
DROP TABLE "ProviderDayOff";
