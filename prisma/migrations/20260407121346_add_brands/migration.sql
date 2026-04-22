-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BrandTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BrandCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BrandCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BrandStatus" NOT NULL DEFAULT 'PENDING',
    "owner_id" TEXT NOT NULL,
    "logo_media_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandGallery" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrandGallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_24_7" BOOLEAN NOT NULL DEFAULT false,
    "opening" TEXT,
    "closing" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchBreak" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "BranchBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTransfer" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "status" "BrandTransferStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BrandToBrandCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BrandToBrandCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandCategory_name_key" ON "BrandCategory"("name");

-- CreateIndex
CREATE INDEX "Brand_owner_id_idx" ON "Brand"("owner_id");

-- CreateIndex
CREATE INDEX "Brand_status_idx" ON "Brand"("status");

-- CreateIndex
CREATE INDEX "BrandGallery_brand_id_idx" ON "BrandGallery"("brand_id");

-- CreateIndex
CREATE INDEX "Branch_brand_id_idx" ON "Branch"("brand_id");

-- CreateIndex
CREATE INDEX "BrandTransfer_brand_id_idx" ON "BrandTransfer"("brand_id");

-- CreateIndex
CREATE INDEX "BrandTransfer_from_user_id_idx" ON "BrandTransfer"("from_user_id");

-- CreateIndex
CREATE INDEX "_BrandToBrandCategory_B_index" ON "_BrandToBrandCategory"("B");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandGallery" ADD CONSTRAINT "BrandGallery_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandGallery" ADD CONSTRAINT "BrandGallery_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchBreak" ADD CONSTRAINT "BranchBreak_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTransfer" ADD CONSTRAINT "BrandTransfer_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTransfer" ADD CONSTRAINT "BrandTransfer_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrandToBrandCategory" ADD CONSTRAINT "_BrandToBrandCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrandToBrandCategory" ADD CONSTRAINT "_BrandToBrandCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "BrandCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
