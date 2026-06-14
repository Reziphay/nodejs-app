-- Move service ownership context from Branch to Brand.
-- Existing branch-linked services inherit their branch's brand before branch_id is removed.
ALTER TABLE "Service" ADD COLUMN "brand_id" TEXT;

UPDATE "Service" service
SET "brand_id" = branch."brand_id"
FROM "Branch" branch
WHERE service."branch_id" = branch."id";

DROP INDEX IF EXISTS "Service_branch_id_idx";

ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_branch_id_fkey";
ALTER TABLE "Service" DROP COLUMN "branch_id";

CREATE INDEX "Service_brand_id_idx" ON "Service"("brand_id");

ALTER TABLE "Service"
ADD CONSTRAINT "Service_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
