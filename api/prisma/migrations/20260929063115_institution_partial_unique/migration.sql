-- Partial unique: active institutions only (soft-delete friendly)
CREATE UNIQUE INDEX "institution_name_country_code_active_key"
ON "institution" ("name", "country_code")
WHERE "deleted_at" IS NULL;
