CREATE TABLE "FavoriteBrand" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "brand_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FavoriteBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FavoriteService" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FavoriteService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavoriteBrand_user_id_brand_id_key" ON "FavoriteBrand"("user_id", "brand_id");
CREATE INDEX "FavoriteBrand_user_id_created_at_idx" ON "FavoriteBrand"("user_id", "created_at");
CREATE INDEX "FavoriteBrand_brand_id_idx" ON "FavoriteBrand"("brand_id");

CREATE UNIQUE INDEX "FavoriteService_user_id_service_id_key" ON "FavoriteService"("user_id", "service_id");
CREATE INDEX "FavoriteService_user_id_created_at_idx" ON "FavoriteService"("user_id", "created_at");
CREATE INDEX "FavoriteService_service_id_idx" ON "FavoriteService"("service_id");

ALTER TABLE "FavoriteBrand" ADD CONSTRAINT "FavoriteBrand_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteBrand" ADD CONSTRAINT "FavoriteBrand_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteService" ADD CONSTRAINT "FavoriteService_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteService" ADD CONSTRAINT "FavoriteService_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
