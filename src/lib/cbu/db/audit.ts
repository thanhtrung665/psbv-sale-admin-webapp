// src/lib/cbu/db/audit.ts
// Pure core of scripts/cbu-audit.ts: compare the prices STORED on RFQ items with what engine v2 gives for the
// same stored inputs. No I/O here so it can be tested; the script only reads the database and writes the CSV.

import { calculateCbu } from "../index";
import { resolveParams } from "../params";
import { buildLines, paramsFromRfq, type ItemCbuRow, type RfqCbuRow } from "./mapping";

export interface AuditRfq extends RfqCbuRow {
  rfqCode: string;
  totalRevenueUsd?: number | null;
  client?: { companyName?: string | null; name?: string | null } | null;
  items: (ItemCbuRow & { rawPartNumber: string })[];
}

export interface AuditRow {
  rfqCode: string;
  status: string;
  client: string;
  lineNo: number;
  partNo: string;
  qty: number;
  storedDdpUsd: number | null;
  v2DdpUsd: number;
  deltaUsd: number | null;
  deltaPct: number | null;
  storedRevenueUsd: number | null;
  v2RevenueUsd: number;
  selfChecksOk: boolean;
  note: string;
}

export interface AuditSummary {
  rfqs: number;
  lines: number;
  /** Lines whose price differs from the v2 price by at least `thresholdPct`. */
  flagged: number;
  /** Lines with no stored material cost: nothing to price, so they are listed but never compared. */
  unpriceable: number;
  maxAbsPct: number;
  thresholdPct: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * `keepMargins: false` (default) reads a stored line margin of exactly 0 or 25 as "no override" — the artefact of
 * the old column default / `?? 0` (SPEC §11.2 F6), the same rule the cbu_v2 migration applies.
 */
export function auditRfqs(rfqs: AuditRfq[], opts: { keepMargins?: boolean; thresholdPct?: number } = {}) {
  const thresholdPct = opts.thresholdPct ?? 1;
  const rows: AuditRow[] = [];
  let flagged = 0;
  let unpriceable = 0;
  let maxAbsPct = 0;

  for (const rfq of rfqs) {
    const items = rfq.items.map((i) => ({
      ...i,
      marginPercent: !opts.keepMargins && (i.marginPercent === 0 || i.marginPercent === 25) ? null : i.marginPercent,
    }));
    const result = calculateCbu(buildLines(items, undefined), resolveParams(paramsFromRfq(rfq)));
    const checksOk = result.checks.every((c) => c.ok);

    rfq.items.forEach((item, idx) => {
      const v2 = result.lines[idx];
      const stored = item.ddpPriceUsd ?? null;
      const noInputs = v2.materialUsd <= 0;
      if (noInputs) unpriceable++;
      const deltaUsd = stored === null || noInputs ? null : r2(v2.ddpPriceUsd - stored);
      const deltaPct = stored !== null && stored > 0 && !noInputs ? r2(((v2.ddpPriceUsd - stored) / stored) * 100) : null;
      if (deltaPct !== null) {
        maxAbsPct = Math.max(maxAbsPct, Math.abs(deltaPct));
        if (Math.abs(deltaPct) >= thresholdPct) flagged++;
      }
      rows.push({
        rfqCode: rfq.rfqCode,
        status: rfq.status,
        client: rfq.client?.companyName ?? rfq.client?.name ?? "",
        lineNo: item.lineNo,
        partNo: item.rawPartNumber,
        qty: v2.qty,
        storedDdpUsd: stored,
        v2DdpUsd: r2(v2.ddpPriceUsd),
        deltaUsd,
        deltaPct,
        storedRevenueUsd: rfq.totalRevenueUsd ?? null,
        v2RevenueUsd: r2(result.totals.revenueUsd),
        selfChecksOk: checksOk,
        note: noInputs ? "no material cost stored - cannot be priced" : stored === null ? "no stored price" : v2.warnings.join(" | "),
      });
    });
  }

  const summary: AuditSummary = { rfqs: rfqs.length, lines: rows.length, flagged, unpriceable, maxAbsPct, thresholdPct };
  return { rows, summary };
}

const CSV_COLUMNS: (keyof AuditRow)[] = [
  "rfqCode", "status", "client", "lineNo", "partNo", "qty", "storedDdpUsd", "v2DdpUsd", "deltaUsd", "deltaPct",
  "storedRevenueUsd", "v2RevenueUsd", "selfChecksOk", "note",
];

const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "yes" : "NO") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function auditToCsv(rows: AuditRow[]): string {
  return [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}
