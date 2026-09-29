-- AlterTable
ALTER TABLE "incubator" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "incubation" (
    "id" UUID NOT NULL,
    "incubator_id" UUID NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "incubation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incubation_incubator_id_status_idx" ON "incubation"("incubator_id", "status");

-- AddForeignKey
ALTER TABLE "incubation" ADD CONSTRAINT "incubation_incubator_id_fkey" FOREIGN KEY ("incubator_id") REFERENCES "incubator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
