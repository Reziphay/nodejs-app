CREATE TABLE "ServiceRating" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRating_service_id_user_id_key" ON "ServiceRating"("service_id", "user_id");
CREATE INDEX "ServiceRating_service_id_idx" ON "ServiceRating"("service_id");
CREATE INDEX "ServiceRating_user_id_idx" ON "ServiceRating"("user_id");

ALTER TABLE "ServiceRating"
ADD CONSTRAINT "ServiceRating_service_id_fkey"
FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRating"
ADD CONSTRAINT "ServiceRating_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
