-- Missing-model catch-up (PROGRESS.md Sprint 1) — HAND-WRITTEN, IDEMPOTENT.
--
-- prisma/migrations only ever created User, Client, RFQ, RFQItem, Document (20260729114302_init) plus the CBU v2
-- columns on RFQ/RFQItem (20260921120000_cbu_v2, 20260921120100_cbu_v2_margin_cleanup). But prisma/schema.prisma
-- has long declared 6 more models the app depends on in production (Tasks page, AI config, CIPL editing, ...):
-- Task (+ the TaskStatus enum), AiConfig, MasterPart, Supplier, CiplRecord, CiplItem. There has never been a
-- migration for them — someone created them on the live database out of band (`db push` or manual SQL), same
-- root cause as the RFQ/RFQItem drift the CBU v2 migrations already work around (see that file's header).
--
-- Every statement below is written to be safe whether the live database already has these tables (the expected
-- case in production — this migration then does nothing) or doesn't (a fresh dev/sandbox database, or a
-- Supabase project provisioned from a clean migration history):
--   * CREATE TABLE IF NOT EXISTS — Postgres supports this directly.
--   * CREATE TYPE ... — Postgres has NO "IF NOT EXISTS" for this; wrapped in a DO block that swallows the
--     "already exists" error (SQLSTATE 42710 / duplicate_object).
--   * ADD CONSTRAINT (foreign keys) — same problem, same DO-block idiom.
--   * CREATE UNIQUE INDEX IF NOT EXISTS — Postgres supports this directly.
-- Column list, types and defaults below are the exact output of
--   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- filtered down to these 6 models, so they match prisma/schema.prisma exactly — not hand-typed.
--
-- WHAT THIS DOES NOT DO: it does not verify that an already-existing production table's columns actually match
-- prisma/schema.prisma (CREATE TABLE IF NOT EXISTS skips entirely if the table exists, so a mismatch would stay
-- silent). Given the app already reads/writes these tables successfully in production (Tasks, AI config, CIPL),
-- they're assumed to match; if in doubt, compare with `npx prisma db pull` against a read-only connection before
-- applying `migrate resolve --applied`, rather than trusting this comment alone.
--
-- HOW TO APPLY (BACK UP THE DATABASE FIRST; pick one):
--   a) Supabase SQL editor / psql: paste and run this whole file as one batch, then, only if the
--      "_prisma_migrations" table exists and lists the prior migrations:
--        npx prisma migrate resolve --applied 20260922130000_missing_models
--   b) npx prisma db execute --file prisma/migrations/20260922130000_missing_models/migration.sql
--        (then the same `migrate resolve --applied` as above)
--   Do NOT run `prisma migrate dev` against this database.
-- Verify first with: node scripts/verify-missing-models-migration.mjs (embedded Postgres, touches no real DB).

-- ─── 1. TaskStatus enum ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Task ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. AiConfig ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AiConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'core',
    "apiKey" TEXT NOT NULL,
    "modelName" TEXT NOT NULL DEFAULT 'gemini-1.5-pro',
    "inquiryPrompt" TEXT,
    "quotePrompt" TEXT,
    "toolsConfig" TEXT,
    "resendApiKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- ─── 4. MasterPart ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MasterPart" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MasterPart_partNumber_key" ON "MasterPart"("partNumber");

-- ─── 5. Supplier ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "recipientName" TEXT,
    "ccEmails" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_email_key" ON "Supplier"("email");

-- ─── 6. CiplRecord ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CiplRecord" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "invoiceDate" TEXT,
    "poNo" TEXT,
    "poDate" TEXT,
    "incoterm" TEXT,
    "mot" TEXT,
    "pol" TEXT,
    "pod" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "consigneeAttn" TEXT,
    "consigneeEmail" TEXT,
    "consigneeTel" TEXT,
    "totalAmount" TEXT,
    "totalWeightLbs" TEXT,
    "numberOfBox" TEXT,
    "boxDimension" TEXT,
    "shippingMark" TEXT,
    "sourceFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CiplRecord_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CiplRecord" ADD CONSTRAINT "CiplRecord_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 7. CiplItem ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CiplItem" (
    "id" TEXT NOT NULL,
    "ciplRecordId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "partNo" TEXT NOT NULL,
    "description" TEXT,
    "hsCode" TEXT,
    "quantity" TEXT,
    "countryOrigin" TEXT,
    "uom" TEXT,
    "unitPrice" TEXT,
    "extPrice" TEXT,
    "batchNo" TEXT,
    "netWeight" TEXT,

    CONSTRAINT "CiplItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CiplItem" ADD CONSTRAINT "CiplItem_ciplRecordId_fkey" FOREIGN KEY ("ciplRecordId") REFERENCES "CiplRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── ROLLBACK (manual, run only if needed; drops data — think twice) ────────────
-- DROP TABLE IF EXISTS "CiplItem";
-- DROP TABLE IF EXISTS "CiplRecord";
-- DROP TABLE IF EXISTS "Supplier";
-- DROP TABLE IF EXISTS "MasterPart";
-- DROP TABLE IF EXISTS "AiConfig";
-- DROP TABLE IF EXISTS "Task";
-- DROP TYPE IF EXISTS "TaskStatus";
