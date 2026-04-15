-- Add branch_cover value to MediaKind enum
ALTER TYPE "MediaKind" ADD VALUE 'branch_cover';

-- Add nullable cover_media_id column to Branch
ALTER TABLE "Branch" ADD COLUMN "cover_media_id" TEXT;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_cover_media_id_fkey"
    FOREIGN KEY ("cover_media_id") REFERENCES "Media"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
