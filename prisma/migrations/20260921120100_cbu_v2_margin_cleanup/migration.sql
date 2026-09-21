-- CBU v2 (SPEC.md §11.8) — STEP 2 of 2 — HAND-WRITTEN, IDEMPOTENT. APPLY ONLY AFTER THE CBU v2 CODE IS DEPLOYED.
--
-- WHY THE ORDER MATTERS: the pre-v2 GET /api/rfq/[id] coerces a NULL RFQItem."marginPercent" to 0, and the pre-v2
-- page then treats that 0 as a real "0% margin" override. This step makes marginPercent NULL for every line that
-- carried no real override (backfill) and for every NEW line (no default). With the OLD code still running that would
-- silently turn those lines into 0% margins. The v2 code keeps NULL as NULL ("use the target margin").
-- If the v2 deploy has to be rolled back, run the ROLLBACK block at the bottom of THIS file first.
--
-- It touches ONLY "RFQItem"."marginPercent". Safe to run more than once.
--
-- HOW TO APPLY (after the deploy; pick one):
--   a) Supabase SQL editor / psql: paste and run this whole file as one batch, then, only if the
--      "_prisma_migrations" table exists and lists the init migration:
--        npx prisma migrate resolve --applied 20260921120100_cbu_v2_margin_cleanup
--   b) npx prisma db execute --file prisma/migrations/20260921120100_cbu_v2_margin_cleanup/migration.sql

-- ─── RFQItem."marginPercent": stop inventing overrides (SPEC §11.2 F6) ──────────
-- Old behaviour: column default (25 in schema.prisma, 0 in the init migration) plus a route that wrote
-- `item.marginPercent ?? 0`. So 0 and 25 carry NO information: they are what "no override" looked like.
-- From now on NULL means "use the order-wide target margin".

-- a. Backup first (only the first run creates it; re-runs never overwrite it).
CREATE TABLE IF NOT EXISTS "_cbu_v2_margin_backup" AS
  SELECT "id" AS "rfqItemId", "marginPercent", now() AS "backedUpAt"
  FROM "RFQItem"
  WHERE "marginPercent" IS NOT NULL;

-- b. No default any more.
ALTER TABLE "RFQItem" ALTER COLUMN "marginPercent" DROP DEFAULT;

-- c. Backfill. A real override typed as exactly 0 or 25 is also reset to NULL (25 = the old target anyway;
--    a genuine 0% is rare and is restorable from the backup table).
UPDATE "RFQItem" SET "marginPercent" = NULL WHERE "marginPercent" IN (0, 25);

-- ─── ROLLBACK (manual, run only if needed) ──────────────────────────────────────
-- UPDATE "RFQItem" i SET "marginPercent" = b."marginPercent"
--   FROM "_cbu_v2_margin_backup" b WHERE b."rfqItemId" = i."id";
-- ALTER TABLE "RFQItem" ALTER COLUMN "marginPercent" SET DEFAULT 25;
-- DROP TABLE IF EXISTS "_cbu_v2_margin_backup";
