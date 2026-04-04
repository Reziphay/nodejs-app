-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('avatar', 'document', 'other');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar_media_id" TEXT;

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'other',
    "storage_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" TEXT NOT NULL,
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_owner_id_idx" ON "Media"("owner_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
