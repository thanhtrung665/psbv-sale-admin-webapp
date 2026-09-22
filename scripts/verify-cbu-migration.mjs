// Verifies the two CBU v2 migrations on a THROW-AWAY in-memory Postgres (PGlite).
// It never touches DATABASE_URL. Usage: node scripts/verify-cbu-migration.mjs
//
//   STEP 1  prisma/migrations/*_cbu_v2                 additive; must be SAFE WITH THE OLD CODE STILL RUNNING
//   STEP 2  prisma/migrations/*_cbu_v2_margin_cleanup  backup + drop default + backfill; only after the new code is live
//
// Checks: both apply on top of the `init` migration; each is idempotent (applied twice); STEP 1 alone changes no
// existing data and no marginPercent default (old code keeps working); STEP 2 backs up and backfills correctly.
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
const step1 = pick("_cbu_v2");
const step2 = pick("_cbu_v2_margin_cleanup");

const db = new PGlite();
await db.exec(initSql);
await db.exec(`INSERT INTO "Client" ("id","name","companyName","email") VALUES ('c1','A','A Co','a@a.com')`);
await db.exec(`INSERT INTO "RFQ" ("id","rfqCode","clientId","status","updatedAt") VALUES
  ('r1','R1','c1','CBU_PENDING_ADMIN', now()), ('r2','R2','c1','QUOTED_TO_CLIENT', now())`);
const seed = [
  ["i1", "r1", 1, 25],   // old schema default        -> NULL after STEP 2
  ["i2", "r1", 2, 0],    // legacy `?? 0` artefact    -> NULL after STEP 2
  ["i3", "r2", 1, 0],    // finalized RFQ, artefact   -> NULL after STEP 2
  ["i4", "r2", 2, 32.5], // a real override           -> KEPT
  ["i5", "r2", 3, null], // already NULL              -> stays NULL
];
for (const [id, rfq, lineNo, margin] of seed) {
  await db.query(`INSERT INTO "RFQItem" ("id","rfqId","lineNo","rawPartNumber","marginPercent") VALUES ($1,$2,$3,'P',$4)`, [id, rfq, lineNo, margin]);
}

const failures = [];
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures.push(name); };
const columns = async (t) => (await db.query(`select column_name from information_schema.columns where table_name='${t}'`)).rows.map((r) => r.column_name);
const defaultOf = async (t, c) => (await db.query(`select column_default d from information_schema.columns where table_name='${t}' and column_name='${c}'`)).rows[0]?.d;
const margins = async () => Object.fromEntries((await db.query(`select id, "marginPercent" m from "RFQItem"`)).rows.map((r) => [r.id, r.m]));
const tableExists = async (t) => (await db.query(`select 1 from information_schema.tables where table_name='${t}'`)).rows.length > 0;

const marginsBefore = await margins();
const marginDefaultBefore = await defaultOf("RFQItem", "marginPercent");

// ── STEP 1 ────────────────────────────────────────────────────────────────────
console.log("\n# STEP 1 (additive)");
await db.exec(step1);
await db.exec(step1); // idempotent

const rfqCols = await columns("RFQ");
for (const c of ["cbuProfile", "cbuMode", "targetMarginPercent", "commissionRate", "citOnCommission", "cbuConfig", "cbuCalculatedAt"]) {
  check(`RFQ.${c} exists`, rfqCols.includes(c));
}
check("RFQItem.marginOverrideUsd exists", (await columns("RFQItem")).includes("marginOverrideUsd"));
check("RFQ.targetMarginPercent default 25", String(await defaultOf("RFQ", "targetMarginPercent")) === "25");
check("RFQ.clearanceCost default 0", String(await defaultOf("RFQ", "clearanceCost")) === "0");
check("RFQ.inlandCost default 0", String(await defaultOf("RFQ", "inlandCost")) === "0");
check("RFQ.exchangeRate default 26500", String(await defaultOf("RFQ", "exchangeRate")) === "26500");
const r1 = (await db.query(`select "cbuMode","commissionRate","citOnCommission","targetMarginPercent" from "RFQ" where id='r1'`)).rows[0];
check("existing RFQ rows receive the defaults", r1.cbuMode === "MARGIN_INPUT" && r1.commissionRate === 3 && r1.citOnCommission === 20 && r1.targetMarginPercent === 25);

// The point of the split: with only STEP 1 applied, the OLD code must see exactly what it saw before.
check("STEP 1 alone: RFQItem.marginPercent values are untouched (old code keeps working)", JSON.stringify(await margins()) === JSON.stringify(marginsBefore));
check("STEP 1 alone: RFQItem.marginPercent default is untouched", (await defaultOf("RFQItem", "marginPercent")) === marginDefaultBefore);
check("STEP 1 alone: no backup table yet", !(await tableExists("_cbu_v2_margin_backup")));

// ── STEP 2 ────────────────────────────────────────────────────────────────────
console.log("\n# STEP 2 (after the new code is deployed)");
await db.exec(step2);
await db.exec(step2); // idempotent

const after = await margins();
check("marginPercent 25 / 0 reset to NULL, real override 32.5 kept",
  after.i1 === null && after.i2 === null && after.i3 === null && after.i4 === 32.5 && after.i5 === null);
check("RFQItem.marginPercent has no default", (await defaultOf("RFQItem", "marginPercent")) === null);
const backup = (await db.query(`select "rfqItemId" id, "marginPercent" m from "_cbu_v2_margin_backup" order by 1`)).rows;
check("backup holds the 4 non-NULL original values (not overwritten by the 2nd run)",
  backup.length === 4 && backup.find((b) => b.id === "i1").m === 25 && backup.find((b) => b.id === "i4").m === 32.5);

console.log(failures.length === 0 ? "\nMigrations verified." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
