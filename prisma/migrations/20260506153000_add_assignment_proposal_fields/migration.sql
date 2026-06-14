ALTER TABLE "TeamMemberServiceAssignment"
ADD COLUMN "proposed_description" TEXT,
ADD COLUMN "proposed_price" DECIMAL(10, 2),
ADD COLUMN "proposed_duration" INTEGER;
