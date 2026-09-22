-- Indexes for every foreign-key column that didn't have one (PROGRESS.md Sprint 2) — HAND-WRITTEN, IDEMPOTENT.
--
-- Postgres does not auto-index a foreign-key column the way some other databases do, and none of
-- RFQ.clientId, RFQItem.rfqId, Document.rfqId, Task.assigneeId, Task.creatorId, CiplRecord.rfqId,
-- CiplItem.ciplRecordId had one. Every list/detail query that filters or joins on these (e.g. "all items for
-- this RFQ", "all tasks assigned to this user") was doing a sequential scan.
--
-- Purely additive — no column, table or data changes — so unlike the CBU v2 / missing-models migrations this
-- one carries no ordering risk with the app code and can be applied whenever convenient. Statement names match
-- `npx prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script` exactly, so a future
-- `prisma migrate diff` against this baseline reports no drift.
--
-- HOW TO APPLY (pick one):
--   a) Supabase SQL editor / psql: paste and run this file, then:
--        npx prisma migrate resolve --applied 20260922140000_fk_indexes
--   b) npx prisma db execute --file prisma/migrations/20260922140000_fk_indexes/migration.sql
--        (then the same `migrate resolve --applied` as above)
--   Do NOT run `prisma migrate dev` against this database.
-- Verify first with: node scripts/verify-fk-indexes-migration.mjs (embedded Postgres, touches no real DB).

CREATE INDEX IF NOT EXISTS "RFQ_clientId_idx" ON "RFQ"("clientId");
CREATE INDEX IF NOT EXISTS "RFQItem_rfqId_idx" ON "RFQItem"("rfqId");
CREATE INDEX IF NOT EXISTS "Document_rfqId_idx" ON "Document"("rfqId");
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_creatorId_idx" ON "Task"("creatorId");
CREATE INDEX IF NOT EXISTS "CiplRecord_rfqId_idx" ON "CiplRecord"("rfqId");
CREATE INDEX IF NOT EXISTS "CiplItem_ciplRecordId_idx" ON "CiplItem"("ciplRecordId");

-- ─── ROLLBACK (manual, run only if needed) ──────────────────────────────────
-- DROP INDEX IF EXISTS "RFQ_clientId_idx";
-- DROP INDEX IF EXISTS "RFQItem_rfqId_idx";
-- DROP INDEX IF EXISTS "Document_rfqId_idx";
-- DROP INDEX IF EXISTS "Task_assigneeId_idx";
-- DROP INDEX IF EXISTS "Task_creatorId_idx";
-- DROP INDEX IF EXISTS "CiplRecord_rfqId_idx";
-- DROP INDEX IF EXISTS "CiplItem_ciplRecordId_idx";
