/**
 * CBU audit — READ-ONLY. Recalculates every RFQ that already carries a price (QUOTATION_DRAFTED and
 * QUOTED_TO_CLIENT by default) with the CBU engine v2 and lists, per line, how far the price stored in the
 * database is from the corrected one. It exists to support the COMMERCIAL decision about quotations that were
 * priced by the old engine (PROGRESS.md §6.4 Q8) — it changes nothing.
 *
 *   npx tsx scripts/cbu-audit.ts                    # CSV to stdout, summary to stderr
 *   npx tsx scripts/cbu-audit.ts --out audit.csv
 *   npx tsx scripts/cbu-audit.ts --status QUOTED_TO_CLIENT
 *   npx tsx scripts/cbu-audit.ts --keep-margins     # do NOT treat stored margin 0 / 25 as "no override"
 *
 * Safe to run BEFORE or AFTER the cbu_v2 migration (it never selects the new columns). Uses DATABASE_URL and only
 * calls `findMany`. The comparison itself lives in src/lib/cbu/db/audit.ts (unit-tested).
 *
 * HOW TO READ THE RESULT — it is an ESTIMATE, not a re-issue of the quotation:
 *  - The old page never saved commission %, CIT %, target margin or edits to material cost / weight (SPEC §11.2 F5),
 *    so those are rebuilt from the stored columns and the engine defaults (commission 3, CIT 20, target 25).
 *  - A stored line margin of 0 or 25 is the artefact of the old default / `?? 0` and is read as "no override"
 *    (same rule as the migration). Use --keep-margins to turn that off.
 *  - A large gap therefore means "this price deserves a look", not "this price is wrong by exactly that much".
 */
import fs from "node:fs";
import dotenv from "dotenv";
import { auditRfqs, auditToCsv, type AuditRfq } from "../src/lib/cbu/db/audit";

// `tsx` does not load env files the way Next does; without this DATABASE_URL is empty and pg falls back to localhost.
dotenv.config({ path: [".env.local", ".env"], quiet: true });

interface Args {
  out?: string;
  statuses: string[];
  keepMargins: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { statuses: ["QUOTATION_DRAFTED", "QUOTED_TO_CLIENT"], keepMargins: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--keep-margins") args.keepMargins = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--status") args.statuses = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const HELP = `CBU audit (read-only). Options: --out <file.csv> · --status A,B · --keep-margins · --help
See the header of scripts/cbu-audit.ts for how to read the result.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  // Imported lazily so `--help` never opens a database connection.
  const { prisma } = await import("../src/lib/prisma");

  const rfqs = await prisma.rFQ.findMany({
    where: { status: { in: args.statuses as never[] } },
    // omit the columns added by the cbu_v2 migration → works on a database that does not have them yet
    omit: { cbuProfile: true, cbuMode: true, targetMarginPercent: true, commissionRate: true, citOnCommission: true, cbuConfig: true, cbuCalculatedAt: true },
    include: { client: true, items: { orderBy: { lineNo: "asc" }, omit: { marginOverrideUsd: true } } },
    orderBy: { createdAt: "asc" },
  });

  const { rows, summary } = auditRfqs(rfqs as unknown as AuditRfq[], { keepMargins: args.keepMargins });
  const csv = auditToCsv(rows);
  if (args.out) fs.writeFileSync(args.out, csv, "utf8");
  else process.stdout.write(csv);

  console.error(
    `Audited ${summary.rfqs} RFQ(s), ${summary.lines} line(s) with status ${args.statuses.join(" / ")}. ` +
      `Lines whose price differs by >= ${summary.thresholdPct}%: ${summary.flagged}. Largest gap: ${summary.maxAbsPct}%. ` +
      `Lines with no material cost stored (not comparable): ${summary.unpriceable}.` +
      (args.out ? ` CSV written to ${args.out}.` : "")
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
