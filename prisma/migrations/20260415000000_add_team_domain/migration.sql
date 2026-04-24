-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "role" "TeamMemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_branch_id_key" ON "Team"("branch_id");

-- CreateIndex
CREATE INDEX "Team_created_by_user_id_idx" ON "Team"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_team_id_user_id_key" ON "TeamMember"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "TeamMember_team_id_idx" ON "TeamMember"("team_id");

-- CreateIndex
CREATE INDEX "TeamMember_user_id_idx" ON "TeamMember"("user_id");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Backfill: create a Team for every Branch that does not already have one ──
-- Uses the owning Brand's owner_id as the team creator.
INSERT INTO "Team" ("id", "branch_id", "created_by_user_id", "created_at", "updated_at")
SELECT
    gen_random_uuid()::TEXT,
    b."id",
    br."owner_id",
    NOW(),
    NOW()
FROM "Branch" b
JOIN "Brand" br ON b."brand_id" = br."id"
WHERE NOT EXISTS (
    SELECT 1 FROM "Team" t WHERE t."branch_id" = b."id"
);

-- ─── Backfill: create an OWNER TeamMember for every Team that lacks one ────────
INSERT INTO "TeamMember" ("id", "team_id", "user_id", "invited_by_user_id", "status", "role", "created_at", "updated_at")
SELECT
    gen_random_uuid()::TEXT,
    t."id",
    br."owner_id",
    br."owner_id",
    'ACCEPTED'::"TeamMemberStatus",
    'OWNER'::"TeamMemberRole",
    NOW(),
    NOW()
FROM "Team" t
JOIN "Branch" b ON t."branch_id" = b."id"
JOIN "Brand" br ON b."brand_id" = br."id"
WHERE NOT EXISTS (
    SELECT 1 FROM "TeamMember" tm
    WHERE tm."team_id" = t."id" AND tm."role" = 'OWNER'
);
