-- CreateEnum
CREATE TYPE "MembershipScopeType" AS ENUM ('incubator', 'cluster');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('cluster_admin', 'coorganizer', 'director', 'staff', 'mentor', 'founder', 'judge');

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "scope_type" "MembershipScopeType" NOT NULL,
    "scope_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incubator" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "institution_id" UUID,

    CONSTRAINT "incubator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "startup" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "incubator_id" UUID NOT NULL,
    "owner_user_id" TEXT,

    CONSTRAINT "startup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE INDEX "membership_scope_type_scope_id_idx" ON "membership"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "incubator_institution_id_idx" ON "incubator"("institution_id");

-- CreateIndex
CREATE INDEX "startup_incubator_id_idx" ON "startup"("incubator_id");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incubator" ADD CONSTRAINT "incubator_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup" ADD CONSTRAINT "startup_incubator_id_fkey" FOREIGN KEY ("incubator_id") REFERENCES "incubator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes (soft-delete friendly; never @@unique in Prisma)
CREATE UNIQUE INDEX "membership_user_scope_role_active_key"
ON "membership" ("user_id", "scope_type", "scope_id", "role")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "incubator_slug_active_key"
ON "incubator" ("slug")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "startup_incubator_name_active_key"
ON "startup" ("incubator_id", "name")
WHERE "deleted_at" IS NULL;
