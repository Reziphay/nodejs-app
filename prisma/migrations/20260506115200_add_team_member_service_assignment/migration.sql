-- CreateEnum
CREATE TYPE "ServiceAssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ServiceAssignmentInitiator" AS ENUM ('MEMBER', 'OWNER');

-- CreateTable
CREATE TABLE "TeamMemberServiceAssignment" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" "ServiceAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_by" "ServiceAssignmentInitiator" NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMemberServiceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMemberServiceAssignment_service_id_idx" ON "TeamMemberServiceAssignment"("service_id");

-- CreateIndex
CREATE INDEX "TeamMemberServiceAssignment_status_idx" ON "TeamMemberServiceAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMemberServiceAssignment_team_member_id_service_id_key" ON "TeamMemberServiceAssignment"("team_member_id", "service_id");

-- AddForeignKey
ALTER TABLE "TeamMemberServiceAssignment" ADD CONSTRAINT "TeamMemberServiceAssignment_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMemberServiceAssignment" ADD CONSTRAINT "TeamMemberServiceAssignment_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
