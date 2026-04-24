-- CreateEnum
CREATE TYPE "AuthChallengeKind" AS ENUM (
  'EMAIL_VERIFICATION',
  'PHONE_VERIFICATION',
  'PASSWORD_RESET',
  'TWO_FACTOR_LOGIN',
  'STEP_UP'
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "two_factor_secret" TEXT,
ADD COLUMN "two_factor_enabled_at" TIMESTAMP(3),
ADD COLUMN "pending_two_factor_secret" TEXT,
ADD COLUMN "pending_two_factor_started_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuthChallenge" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" "AuthChallengeKind" NOT NULL,
  "purpose" TEXT NOT NULL,
  "token_hash" TEXT,
  "code_hash" TEXT,
  "target" TEXT,
  "metadata" JSONB,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "delivery_count" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_token_hash_key" ON "AuthChallenge"("token_hash");

-- CreateIndex
CREATE INDEX "AuthChallenge_user_id_kind_idx" ON "AuthChallenge"("user_id", "kind");

-- CreateIndex
CREATE INDEX "AuthChallenge_user_id_purpose_idx" ON "AuthChallenge"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "AuthChallenge_expires_at_idx" ON "AuthChallenge"("expires_at");

-- AddForeignKey
ALTER TABLE "AuthChallenge"
ADD CONSTRAINT "AuthChallenge_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
