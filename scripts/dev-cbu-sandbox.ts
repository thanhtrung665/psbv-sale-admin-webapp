/**
 * Local CBU sandbox — a THROW-AWAY environment to try the CBU pages with real data flow and NO real database.
 *
 *   npx tsx scripts/dev-cbu-sandbox.ts            # DB + seed + `next dev` on http://localhost:3100
 *   npx tsx scripts/dev-cbu-sandbox.ts --db-only  # only the database (port 5544), print the URL
 *
 * What it does
 *  1. starts an in-memory Postgres (PGlite) on 127.0.0.1:5544 — nothing is persisted;
 *  2. creates the full schema from prisma/schema.prisma (`prisma migrate diff --from-empty`);
 *  3. seeds a login and two RFQs built from the AC0084 workbook;
 *  4. starts `next dev` with DATABASE_URL FORCED to that local database, so the app can never reach the Supabase
 *     database in .env (a process env var wins over .env files).
 *
 * Login: sandbox@psbv.local / sandbox123. Seeded RFQs: AC0084-SANDBOX (clean, Excel numbers) and
 * DEMO-CHECKS (a line without weight, a margin override, a missing material cost — to see warnings) and
 * AC0481-SANDBOX (Baker Hughes, FCA / DAP: open it via the "Nước ngoài" option, or switch the model on the page).
 */
import { execFileSync, spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS } from "../__tests__/cbu/fixtures/ac0084";

const DB_PORT = 5544;
const APP_PORT = 3100;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;

async function main() {
  const dbOnly = process.argv.includes("--db-only");

  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 10 });
  await server.start();

  const ddl = execFileSync("npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], {
    encoding: "utf8",
    shell: true,
  });
  await db.exec(ddl);

  await seed(db);
  console.log(`\nSandbox database ready: ${DATABASE_URL}`);
  console.log("Login: sandbox@psbv.local / sandbox123   ·   RFQs: AC0084-SANDBOX, DEMO-CHECKS, AC0481-SANDBOX (Baker)\n");

  if (dbOnly) return; // keep the event loop alive through the socket server

  const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL, // forced: never the real database
      NEXTAUTH_URL: `http://localhost:${APP_PORT}`,
      NEXTAUTH_SECRET: "sandbox-secret-not-for-production",
    },
  });
  const stop = async () => {
    app.kill();
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  app.on("exit", stop);
}

async function seed(db: PGlite) {
  const hash = await bcrypt.hash("sandbox123", 10);
  await db.query(`INSERT INTO "User" ("id","email","password","name","role","updatedAt") VALUES ('u1','sandbox@psbv.local',$1,'Sandbox Admin','ADMIN', now())`, [hash]);
  await db.query(`INSERT INTO "Client" ("id","name","companyName","email") VALUES ('c1','Hoang Son','Hoang Son Co., Ltd','sandbox-client@example.com')`);

  const air = AC0084_LOGISTICS.air;
  const P = AC0084_PARAMS;
  const rfqSql = `INSERT INTO "RFQ" ("id","rfqCode","clientId","status","supplierName","incoTerm","paymentTerm","exchangeRate","vndRoundingStep","lbToKg",
      "freightFixed","freightRatePerKg","chargeableWeightKg","clearanceCost","inlandCost","updatedAt")
    VALUES ($1,$2,'c1','SUPPLIER_QUOTED','Keystone','DDP Vung Tau','30% with order, 70% prior shipment',$3,$4,$5,$6,$7,$8,$9,$10, now())`;
  const rfqArgs = (id: string, code: string) => [id, code, P.fx, P.vndRoundingStep, P.lbToKg, air.freightFixedUsd, air.freightRatePerKg, air.chargeableKg, air.clearanceUsd, air.inlandUsd];
  await db.query(rfqSql, rfqArgs("r1", "AC0084-SANDBOX"));
  await db.query(rfqSql, rfqArgs("r2", "DEMO-CHECKS"));

  // AC0481-SANDBOX: Baker Hughes (FCA / DAP) — starts as a plain RFQ (DDP defaults) so the flow "switch model → save" is exercised.
  await db.query(
    `INSERT INTO "RFQ" ("id","rfqCode","clientId","status","supplierName","incoTerm","paymentTerm","exchangeRate","vndRoundingStep","updatedAt")
     VALUES ('r3','AC0481-SANDBOX','c1','SUPPLIER_QUOTED','Baker Hughes','FCA Houston','Net 60 days',25500,10000, now())`
  );
  await db.query(
    `INSERT INTO "RFQItem" ("id","rfqId","lineNo","rawPartNumber","rawDescription","qty","uom","supplier","supplierUnitPrice","extWeightLbs","dutyPercent","marginPercent")
     VALUES ('r3-l1','r3',1,'480131200','1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE',30,'PCS','Baker Hughes',105.5,43.2,0,NULL)`
  );

  const itemSql = `INSERT INTO "RFQItem" ("id","rfqId","lineNo","rawPartNumber","rawDescription","qty","uom","supplier","supplierUnitPrice","extWeightLbs","dutyPercent","marginPercent")
    VALUES ($1,$2,$3,$4,$5,$6,'PCS','Keystone',$7,$8,$9,$10)`;
  for (const r of AC0084_AIR) {
    await db.query(itemSql, [`r1-l${r.lineNo}`, "r1", r.lineNo, r.partNo, `Insert ${r.partNo}`, r.qty, r.materialUsd, r.totalWeightLb, r.dutyPct, null]);
  }
  // DEMO-CHECKS: first 5 lines; #2 has no weight, #3 has a margin override, #5 has no material cost.
  for (const r of AC0084_AIR.slice(0, 5)) {
    const noWeight = r.lineNo === 2;
    const noMaterial = r.lineNo === 5;
    await db.query(itemSql, [
      `r2-l${r.lineNo}`, "r2", r.lineNo, r.partNo, `Insert ${r.partNo}`, r.qty,
      noMaterial ? null : r.materialUsd, noWeight ? null : r.totalWeightLb, r.dutyPct, r.lineNo === 3 ? 40 : null,
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
