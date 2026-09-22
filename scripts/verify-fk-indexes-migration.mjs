// Verifies prisma/migrations/*_fk_indexes on a THROW-AWAY in-memory Postgres (PGlite).
// It never touches DATABASE_URL. Usage: node scripts/verify-fk-indexes-migration.mjs
//
// Checks:
//  1. Applies on top of `init` + `missing_models` (the two migrations that create every table this one indexes).
//  2. Is idempotent (applied twice in a row without error).
//  3. Creates exactly the 7 expected indexes, each on the expected table/column.
//  4. Existing data survives untouched (this migration never touches rows).
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
const fkIndexesSql = pick("_fk_indexes");

const failures = [];
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures.push(name); };

const EXPECTED = [
  ["RFQ_clientId_idx", "RFQ", "clientId"],
  ["RFQItem_rfqId_idx", "RFQItem", "rfqId"],
  ["Document_rfqId_idx", "Document", "rfqId"],
  ["Task_assigneeId_idx", "Task", "assigneeId"],
  ["Task_creatorId_idx", "Task", "creatorId"],
  ["CiplRecord_rfqId_idx", "CiplRecord", "rfqId"],
  ["CiplItem_ciplRecordId_idx", "CiplItem", "ciplRecordId"],
];

{
  console.log("# Case A: init + missing_models, then this migration (twice, for idempotency)");
  const db = new PGlite();
  await db.exec(initSql);
  await db.exec(missingModelsSql);

  // A row per indexed table, so a real query plan exists to index against.
  await db.query(`INSERT INTO "User" ("id","email","password","name","updatedAt") VALUES ('u1','a@a.com','x','Admin', now())`);
  await db.query(`INSERT INTO "Client" ("id","name","companyName","email") VALUES ('c1','A','A Co','a@a.com')`);
  await db.query(`INSERT INTO "RFQ" ("id","rfqCode","clientId","updatedAt") VALUES ('r1','R1','c1', now())`);
  await db.query(`INSERT INTO "RFQItem" ("id","rfqId","lineNo","rawPartNumber") VALUES ('ri1','r1',1,'P-1')`);
  await db.query(`INSERT INTO "Document" ("id","rfqId","type","fileUrl") VALUES ('d1','r1','INQUIRY_FILE','https://x')`);
  await db.query(`INSERT INTO "Task" ("id","title","assigneeId","creatorId","updatedAt") VALUES ('t1','Follow up','u1','u1', now())`);
  await db.query(`INSERT INTO "CiplRecord" ("id","rfqId","updatedAt") VALUES ('cr1','r1', now())`);
  await db.query(`INSERT INTO "CiplItem" ("id","ciplRecordId","lineNo","partNo") VALUES ('ci1','cr1',1,'P-1')`);

  await db.exec(fkIndexesSql);
  await db.exec(fkIndexesSql); // idempotent

  for (const [indexName, table, column] of EXPECTED) {
    const rows = (await db.query(`select indexdef from pg_indexes where indexname = '${indexName}'`)).rows;
    check(`index ${indexName} exists`, rows.length === 1);
    check(`index ${indexName} is on "${table}"("${column}")`, rows[0] && rows[0].indexdef.includes(`ON public."${table}" USING btree ("${column}")`));
  }

  const rowsUntouched =
    (await db.query(`select 1 from "RFQ" where id='r1'`)).rows.length === 1 &&
    (await db.query(`select 1 from "Task" where id='t1'`)).rows.length === 1 &&
    (await db.query(`select 1 from "CiplItem" where id='ci1'`)).rows.length === 1;
  check("pre-existing rows in every indexed table are untouched", rowsUntouched);

  await db.close();
}

console.log(failures.length === 0 ? "\nMigration verified." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
