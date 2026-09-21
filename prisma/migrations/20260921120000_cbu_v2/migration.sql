-- CBU v2 (SPEC.md §11.8) — STEP 1 of 2 — HAND-WRITTEN, IDEMPOTENT, SAFE WITH THE OLD CODE STILL RUNNING.
--
-- Additive only: new columns and new defaults. The currently deployed (pre-v2) application never reads or writes
-- them, so it keeps working. Apply this BEFORE deploying the CBU v2 code; then apply STEP 2
-- (20260921120100_cbu_v2_margin_cleanup) AFTER the new code is live.
--
-- WHY HAND-WRITTEN: the live database has drifted from prisma/migrations (columns and models exist that
-- migration 20260729114302_init never created), so `prisma migrate dev` would want to RESET it.
-- Every statement below is safe to run more than once and against either drift state
-- (ADD COLUMN IF NOT EXISTS, SET DEFAULT). It touches ONLY "RFQ" and "RFQItem". It is equivalent to the part of
--   prisma migrate diff --from-schema <schema before> --to-schema prisma/schema.prisma --script
-- that adds columns / changes defaults (the marginPercent default is dropped in STEP 2).
--
-- HOW TO APPLY (BACK UP THE DATABASE FIRST; pick one):
--   a) Supabase SQL editor / psql: paste and run this whole file as one batch, then, only if the
--      "_prisma_migrations" table exists and lists the init migration:
--        npx prisma migrate resolve --applied 20260921120000_cbu_v2
--   b) npx prisma db execute --file prisma/migrations/20260921120000_cbu_v2/migration.sql
--        (then the same `migrate resolve --applied` as above)
--   Do NOT run `prisma migrate dev` against this database.

-- ─── 1. RFQ: CBU v2 settings that were never persisted (SPEC §11.2 F5) ─────────
ALTER TABLE "RFQ"
  ADD COLUMN IF NOT EXISTS "cbuProfile"          TEXT DEFAULT 'DDP_IMPORT',
  ADD COLUMN IF NOT EXISTS "cbuMode"             TEXT DEFAULT 'MARGIN_INPUT',
  ADD COLUMN IF NOT EXISTS "targetMarginPercent" DOUBLE PRECISION DEFAULT 25,
  ADD COLUMN IF NOT EXISTS "commissionRate"      DOUBLE PRECISION DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "citOnCommission"     DOUBLE PRECISION DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "cbuConfig"           JSONB,
  ADD COLUMN IF NOT EXISTS "cbuCalculatedAt"    TIMESTAMP(3);

-- Defaults (SPEC §11.6-3, §11.12 Q6): per-shipment costs are no longer prefilled with the numbers of one sample
-- lot, and the FX default matches schema.prisma. Only NEW rows are affected; existing values are untouched.
-- (ADD COLUMN IF NOT EXISTS first: the init migration predates these two columns, the live DB may or may not have them.)
ALTER TABLE "RFQ" ADD COLUMN IF NOT EXISTS "clearanceCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "RFQ" ADD COLUMN IF NOT EXISTS "inlandCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "RFQ" ALTER COLUMN "clearanceCost" SET DEFAULT 0;
ALTER TABLE "RFQ" ALTER COLUMN "inlandCost" SET DEFAULT 0;
ALTER TABLE "RFQ" ALTER COLUMN "exchangeRate" SET DEFAULT 26500;

-- ─── 2. RFQItem: margin $/unit override ─────────────────────────────────────
ALTER TABLE "RFQItem"
  ADD COLUMN IF NOT EXISTS "marginOverrideUsd" DOUBLE PRECISION;

-- ─── ROLLBACK (manual, run only if needed) ──────────────────────────────────────
-- ALTER TABLE "RFQ" ALTER COLUMN "clearanceCost" SET DEFAULT 150;
-- ALTER TABLE "RFQ" ALTER COLUMN "inlandCost" SET DEFAULT 100;
-- ALTER TABLE "RFQ" ALTER COLUMN "exchangeRate" SET DEFAULT 25500;
-- ALTER TABLE "RFQItem" DROP COLUMN IF EXISTS "marginOverrideUsd";
-- ALTER TABLE "RFQ"
--   DROP COLUMN IF EXISTS "cbuProfile", DROP COLUMN IF EXISTS "cbuMode",
--   DROP COLUMN IF EXISTS "targetMarginPercent", DROP COLUMN IF EXISTS "commissionRate",
--   DROP COLUMN IF EXISTS "citOnCommission", DROP COLUMN IF EXISTS "cbuConfig",
--   DROP COLUMN IF EXISTS "cbuCalculatedAt";
