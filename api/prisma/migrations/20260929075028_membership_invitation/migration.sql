-- CreateTable
CREATE TABLE "membership_invitation" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "scope_type" "MembershipScopeType" NOT NULL,
    "scope_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "invited_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "membership_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_invitation_token_hash_idx" ON "membership_invitation"("token_hash");

-- CreateIndex
CREATE INDEX "membership_invitation_email_idx" ON "membership_invitation"("email");

-- CreateIndex
CREATE INDEX "membership_invitation_membership_id_idx" ON "membership_invitation"("membership_id");

-- AddForeignKey
ALTER TABLE "membership_invitation" ADD CONSTRAINT "membership_invitation_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_invitation" ADD CONSTRAINT "membership_invitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
