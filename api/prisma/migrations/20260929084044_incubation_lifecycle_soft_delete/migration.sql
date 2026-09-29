-- AlterTable: expand incubation for T6.10 lifecycle + soft delete
ALTER TABLE "incubation" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "ended_on" DATE,
ADD COLUMN     "exit_reason" TEXT,
ADD COLUMN     "started_on" DATE,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'applied';

-- Partial unique: at most one active incubation per incubator (soft-delete friendly)
CREATE UNIQUE INDEX "incubation_incubator_id_active_key"
ON "incubation" ("incubator_id")
WHERE "status" = 'active' AND "deleted_at" IS NULL;
