-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED_BY_UCR', 'CANCELLED_BY_USO', 'COMPLETED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "buffer_min" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "ucr_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "price_snapshot" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "cancel_reason" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSchedule" (
    "id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,

    CONSTRAINT "ProviderSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDayOff" (
    "id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "ProviderDayOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reservation_provider_user_id_starts_at_idx" ON "Reservation"("provider_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "Reservation_ucr_id_starts_at_idx" ON "Reservation"("ucr_id", "starts_at");

-- CreateIndex
CREATE INDEX "Reservation_service_id_idx" ON "Reservation"("service_id");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_provider_user_id_starts_at_key" ON "Reservation"("provider_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "ProviderSchedule_provider_user_id_weekday_idx" ON "ProviderSchedule"("provider_user_id", "weekday");

-- CreateIndex
CREATE INDEX "ProviderSchedule_branch_id_idx" ON "ProviderSchedule"("branch_id");

-- CreateIndex
CREATE INDEX "ProviderDayOff_provider_user_id_idx" ON "ProviderDayOff"("provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDayOff_provider_user_id_date_key" ON "ProviderDayOff"("provider_user_id", "date");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_ucr_id_fkey" FOREIGN KEY ("ucr_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSchedule" ADD CONSTRAINT "ProviderSchedule_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSchedule" ADD CONSTRAINT "ProviderSchedule_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDayOff" ADD CONSTRAINT "ProviderDayOff_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
