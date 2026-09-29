-- CreateEnum
CREATE TYPE "GeoUnitLevel" AS ENUM ('COUNTRY', 'STATE', 'MUNICIPALITY');

-- CreateEnum
CREATE TYPE "FrameworkStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "institution" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_unit" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "level" "GeoUnitLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "geo_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "major_version" INTEGER NOT NULL DEFAULT 1,
    "status" "FrameworkStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_stage" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "framework_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "framework_stage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geo_unit_parent_id_idx" ON "geo_unit"("parent_id");

-- CreateIndex
CREATE INDEX "geo_unit_code_idx" ON "geo_unit"("code");

-- CreateIndex
CREATE INDEX "framework_stage_framework_id_idx" ON "framework_stage"("framework_id");

-- AddForeignKey
ALTER TABLE "geo_unit" ADD CONSTRAINT "geo_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "geo_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_stage" ADD CONSTRAINT "framework_stage_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
