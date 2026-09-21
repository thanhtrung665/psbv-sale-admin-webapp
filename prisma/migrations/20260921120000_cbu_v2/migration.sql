-- CBU v2 (SPEC.md §11.8) — HAND-WRITTEN, IDEMPOTENT migration.
--
-- WHY HAND-WRITTEN: the live database has drifted from prisma/migrations (columns and models exist that
-- migration 20260729114302_init never created), so `prisma migrate dev` would want to RESET it.
-- Every statement below is safe to run more than once and against either drift state
-- (ADD COLUMN IF NOT EXISTS, DROP DEFAULT, CREATE TABLE IF NOT EXISTS, guarded UPDATE).
-- It touches ONLY "RFQ" and "RFQItem". It is equivalent to the output of
--   prisma migrate diff --from-schema <schema before> --to-schema prisma/schema.prisma --script
-- plus the backup and the backfill of section 3.
--
-- HOW TO APPLY (pick one; BACK UP THE DATABASE FIRST):
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

-- ─── 3. RFQItem."marginPercent": stop inventing overrides (SPEC §11.2 F6) ────
-- Old behaviour: column default (25 in schema.prisma, 0 in the init migration) plus a route that wrote
-- `item.marginPercent ?? 0`. So 0 and 25 carry NO information: they are what "no override" looked like.
-- From now on NULL means "use the order-wide target margin".

-- 3a. Backup first (only the first run creates it; re-runs never overwrite it).
CREATE TABLE IF NOT EXISTS "_cbu_v2_margin_backup" AS
  SELECT "id" AS "rfqItemId", "marginPercent", now() AS "backedUpAt"
  FROM "RFQItem"
  WHERE "marginPercent" IS NOT NULL;

-- 3b. No default any more.
ALTER TABLE "RFQItem" ALTER COLUMN "marginPercent" DROP DEFAULT;

-- 3c. Backfill. A real override typed as exactly 0 or 25 is also reset to NULL (25 = the old target anyway;
--     a genuine 0% is rare and is restorable from the backup table).
UPDATE "RFQItem" SET "marginPercent" = NULL WHERE "marginPercent" IN (0, 25);

-- ─── ROLLBACK (manual, run only if needed) ──────────────────────────────────────
-- UPDATE "RFQItem" i SET "marginPercent" = b."marginPercent"
--   FROM "_cbu_v2_margin_backup" b WHERE b."rfqItemId" = i."id";
-- ALTER TABLE "RFQItem" ALTER COLUMN "marginPercent" SET DEFAULT 25;
-- ALTER TABLE "RFQ" ALTER COLUMN "clearanceCost" SET DEFAULT 150;
-- ALTER TABLE "RFQ" ALTER COLUMN "inlandCost" SET DEFAULT 100;
-- ALTER TABLE "RFQ" ALTER COLUMN "exchangeRate" SET DEFAULT 25500;
-- ALTER TABLE "RFQItem" DROP COLUMN IF EXISTS "marginOverrideUsd";
-- ALTER TABLE "RFQ"
--   DROP COLUMN IF EXISTS "cbuProfile", DROP COLUMN IF EXISTS "cbuMode",
--   DROP COLUMN IF EXISTS "targetMarginPercent", DROP COLUMN IF EXISTS "commissionRate",
--   DROP COLUMN IF EXISTS "citOnCommission", DROP COLUMN IF EXISTS "cbuConfig",
--   DROP COLUMN IF EXISTS "cbuCalculatedAt";
-- DROP TABLE IF EXISTS "_cbu_v2_margin_backup";
