-- Reject overlapping validity ranges per startup (contiguous [) ranges are allowed).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "startup_snapshot" ADD CONSTRAINT "startup_snapshot_no_overlap"
EXCLUDE USING gist (
  startup_id WITH =,
  tsrange("valid_from", COALESCE("valid_to", 'infinity'::timestamp), '[)') WITH &&
);
