// Verifies prisma/migrations/*_missing_models on a THROW-AWAY in-memory Postgres (PGlite).
// It never touches DATABASE_URL. Usage: node scripts/verify-missing-models-migration.mjs
//
// Checks:
//  1. Applies on top of the `init` migration (User/Client/RFQ/RFQItem/Document only — the checked-in baseline).
//  2. Is idempotent (applied twice in a row without error).
//  3. Creates TaskStatus + all 6 tables with working foreign keys (insert through Task -> User and
//     CiplItem -> CiplRecord -> RFQ).
//  4. Is a no-op — and does not touch existing rows — when a table already exists (the expected production case,
//     since these tables were created out of band before this migration existed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.error("Cannot import @electric-sql/pglite (it ships with the Prisma CLI). Run `npm install` first.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");
const dirs = fs.readdirSync(root);
const pick = (suffix) => {
  const d = dirs.find((x) => x.endsWith(suffix));
  if (!d) throw new Error(`migration folder *${suffix} not found`);
  return fs.readFileSync(path.join(root, d, "migration.sql"), "utf8");
};
const initSql = pick("_init");
const missingModelsSql = pick("_missing_models");

const failures = [];
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures.push(name); };

// ── Case A: fresh database (no drift) ──────────────────────────────────────────
{
  console.log("# Case A: baseline `init` only, then this migration (twice, for idempotency)");
  const db = new PGlite();
  await db.exec(initSql);
  await db.exec(missingModelsSql);
  await db.exec(missingModelsSql); // idempotent

  const tableExists = async (t) => (await db.query(`select 1 from information_schema.tables where table_name='${t}'`)).rows.length > 0;
  const columns = async (t) => (await db.query(`select column_name from information_schema.columns where table_name='${t}'`)).rows.map((r) => r.column_name);
  const enumValues = async (t) => (await db.query(`select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = '${t}' order by e.enumsortorder`)).rows.map((r) => r.enumlabel);

  for (const t of ["Task", "AiConfig", "MasterPart", "Supplier", "CiplRecord", "CiplItem"]) {
    check(`table ${t} exists`, await tableExists(t));
  }
  check("TaskStatus enum has PENDING/IN_PROGRESS/DONE", JSON.stringify(await enumValues("TaskStatus")) === JSON.stringify(["PENDING", "IN_PROGRESS", "DONE"]));
  check("Task has assigneeId/creatorId/status columns", (await columns("Task")).includes("assigneeId") && (await columns("Task")).includes("creatorId") && (await columns("Task")).includes("status"));
  check("MasterPart.partNumber unique index exists", (await db.query(`select 1 from pg_indexes where indexname = 'MasterPart_partNumber_key'`)).rows.length === 1);
  check("Supplier.email unique index exists", (await db.query(`select 1 from pg_indexes where indexname = 'Supplier_email_key'`)).rows.length === 1);

  // ── Foreign keys actually work end to end ──
  await db.query(`INSERT INTO "User" ("id","email","password","name","updatedAt") VALUES ('u1','a@a.com','x','Admin', now())`);
  await db.query(`INSERT INTO "Task" ("id","title","assigneeId","creatorId","updatedAt") VALUES ('t1','Follow up','u1','u1', now())`);
  check("Task -> User FKs accept a valid row", (await db.query(`select 1 from "Task" where id='t1'`)).rows.length === 1);
  const badFk = await db.query(`INSERT INTO "Task" ("id","title","assigneeId","creatorId","updatedAt") VALUES ('t2','Bad','nobody','u1', now())`).then(() => "no error", (e) => e.message);
  check("Task.assigneeId FK rejects an unknown user", badFk !== "no error");

  await db.query(`INSERT INTO "Client" ("id","name","companyName","email") VALUES ('c1','A','A Co','a@a.com')`);
  await db.query(`INSERT INTO "RFQ" ("id","rfqCode","clientId","updatedAt") VALUES ('r1','R1','c1', now())`);
  await db.query(`INSERT INTO "CiplRecord" ("id","rfqId","updatedAt") VALUES ('cr1','r1', now())`);
  await db.query(`INSERT INTO "CiplItem" ("id","ciplRecordId","lineNo","partNo") VALUES ('ci1','cr1',1,'P-1')`);
  check("CiplItem -> CiplRecord -> RFQ FKs accept a valid chain", (await db.query(`select 1 from "CiplItem" where id='ci1'`)).rows.length === 1);
  const cascade = await db.query(`DELETE FROM "RFQ" WHERE id='r1'`).then(() => (async () => (await db.query(`select 1 from "CiplItem" where id='ci1'`)).rows.length)(), () => -1);
  check("deleting the RFQ cascades through CiplRecord to CiplItem (onDelete: Cascade)", (await cascade) === 0);

  await db.close();
}

// ── Case B: the expected production shape — tables already exist before this migration runs ──────────────────
{
  console.log("\n# Case B: tables pre-exist (out-of-band creation, like the real database) — must be a true no-op");
  const db = new PGlite();
  await db.exec(initSql);
  // A minimal but representative pre-existing "Supplier" table with data already in it, created some other way.
  await db.exec(`CREATE TABLE "Supplier" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "companyName" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE)`);
  await db.query(`INSERT INTO "Supplier" ("id","name","companyName","email") VALUES ('s1','Keystone','Keystone Inc','s@keystone.com')`);

  await db.exec(missingModelsSql);
  await db.exec(missingModelsSql); // idempotent even mixed with a pre-existing table

  const row = (await db.query(`select * from "Supplier" where id='s1'`)).rows[0];
  check("pre-existing Supplier row is untouched", row && row.name === "Keystone" && row.email === "s@keystone.com");
  check("pre-existing Supplier table was not replaced with the full column set (CREATE TABLE IF NOT EXISTS skipped it)",
    (await db.query(`select column_name from information_schema.columns where table_name='Supplier'`)).rows.length === 4);
  // The other 5 tables/enum still get created normally since they didn't pre-exist.
  const tableExists = async (t) => (await db.query(`select 1 from information_schema.tables where table_name='${t}'`)).rows.length > 0;
  for (const t of ["Task", "AiConfig", "MasterPart", "CiplRecord", "CiplItem"]) {
    check(`table ${t} still gets created`, await tableExists(t));
  }

  await db.close();
}

console.log(failures.length === 0 ? "\nMigration verified." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
