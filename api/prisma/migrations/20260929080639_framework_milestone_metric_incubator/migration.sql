-- AlterTable
ALTER TABLE "incubator" ADD COLUMN     "framework_id" UUID;

-- CreateTable
CREATE TABLE "milestone" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stage_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_def" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "framework_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allow_negative" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "metric_def_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestone_stage_id_idx" ON "milestone"("stage_id");

-- CreateIndex
CREATE INDEX "metric_def_framework_id_idx" ON "metric_def"("framework_id");

-- CreateIndex
CREATE INDEX "incubator_framework_id_idx" ON "incubator"("framework_id");

-- AddForeignKey
ALTER TABLE "incubator" ADD CONSTRAINT "incubator_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "framework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "framework_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_def" ADD CONSTRAINT "metric_def_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial uniques among active soft-delete rows
CREATE UNIQUE INDEX "framework_name_major_version_active_key"
ON "framework" ("name", "major_version")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "framework_stage_framework_id_sort_order_active_key"
ON "framework_stage" ("framework_id", "sort_order")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "milestone_stage_id_sort_order_active_key"
ON "milestone" ("stage_id", "sort_order")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "metric_def_framework_id_key_active_key"
ON "metric_def" ("framework_id", "key")
WHERE "deleted_at" IS NULL;
