-- AlterTable
ALTER TABLE "incubation" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "metric_reading" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startup_id" UUID NOT NULL,
    "metric_def_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,

    CONSTRAINT "metric_reading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_reading_startup_id_idx" ON "metric_reading"("startup_id");

-- CreateIndex
CREATE INDEX "metric_reading_metric_def_id_idx" ON "metric_reading"("metric_def_id");

-- CreateIndex
CREATE INDEX "metric_reading_startup_id_period_idx" ON "metric_reading"("startup_id", "period");

-- AddForeignKey
ALTER TABLE "metric_reading" ADD CONSTRAINT "metric_reading_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_reading" ADD CONSTRAINT "metric_reading_metric_def_id_fkey" FOREIGN KEY ("metric_def_id") REFERENCES "metric_def"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active uniqueness: one reading per startup + metric + period (soft-delete friendly)
CREATE UNIQUE INDEX "metric_reading_startup_metric_period_active_key"
ON "metric_reading" ("startup_id", "metric_def_id", "period")
WHERE "deleted_at" IS NULL;
