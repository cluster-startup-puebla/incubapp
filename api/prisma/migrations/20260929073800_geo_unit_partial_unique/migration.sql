-- Partial unique: active geo units only (soft-delete friendly)
CREATE UNIQUE INDEX "geo_unit_level_code_active_key"
ON "geo_unit" ("level", "code")
WHERE "deleted_at" IS NULL;
