/*
  Warnings:

  - Added the required column `domain` to the `startup` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StartupVisibility" AS ENUM ('PRIVATE', 'INCUBATOR', 'CLUSTER', 'PUBLIC');

-- AlterTable
ALTER TABLE "startup" ADD COLUMN     "domain" TEXT NOT NULL,
ADD COLUMN     "visibility" "StartupVisibility" NOT NULL DEFAULT 'INCUBATOR';

-- CreateTable
CREATE TABLE "startup_snapshot" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startup_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),

    CONSTRAINT "startup_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "startup_snapshot_startup_id_idx" ON "startup_snapshot"("startup_id");

-- CreateIndex
CREATE INDEX "startup_domain_idx" ON "startup"("domain");

-- AddForeignKey
ALTER TABLE "startup_snapshot" ADD CONSTRAINT "startup_snapshot_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
