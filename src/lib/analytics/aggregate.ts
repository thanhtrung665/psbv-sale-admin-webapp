// src/lib/analytics/aggregate.ts
// Pure aggregation functions for the /overview dashboard (SPEC.md §12). No Prisma, no fetch — every function
// takes the RFQ rows the caller already has and returns plain data ready for a chart. Testable without a
// database (mirrors src/lib/cbu/'s "pure engine, tested without DB" convention).

import { ORDER_STATUSES } from "../order-status";
import type { AnalyticsRfqRow, ClientRevenue, MonthlyRevenuePoint, StatusCount } from "./types";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

/**
 * Revenue and margin summed by calendar month, for the `monthsBack` months up to and including `now`'s month.
 * Every month in the range is present (zero-filled) so a chart's x-axis never skips a month just because no
 * RFQ was priced that month. Only RFQs with a positive `totalRevenueUsd` are counted — matches the KPI cards'
 * existing definition of "priced" (SPEC.md §12.1).
 */
export function revenueByMonth(rfqs: AnalyticsRfqRow[], monthsBack = 12, now: Date = new Date()): MonthlyRevenuePoint[] {
  const months: MonthlyRevenuePoint[] = [];
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push({ month: monthKey(d), label: monthLabel(d), revenueUsd: 0, marginUsd: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));

  for (const rfq of rfqs) {
    const revenue = rfq.totalRevenueUsd ?? 0;
    if (revenue <= 0) continue;
    const bucket = byMonth.get(monthKey(rfq.createdAt));
    if (!bucket) continue; // outside the window
    bucket.revenueUsd += revenue;
    bucket.marginUsd += rfq.totalMarginUsd ?? 0;
  }

  return months;
}

/** Count of RFQs per status, one entry per value of OrderStatus in lifecycle order (zero-filled). */
export function statusBreakdown(rfqs: AnalyticsRfqRow[]): StatusCount[] {
  const counts = new Map<string, number>(ORDER_STATUSES.map((s) => [s, 0]));
  for (const rfq of rfqs) {
    if (counts.has(rfq.status)) counts.set(rfq.status, (counts.get(rfq.status) ?? 0) + 1);
  }
  return ORDER_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

/** Top clients by total priced revenue, descending. Clients with no priced RFQ are left out. */
export function topClients(rfqs: AnalyticsRfqRow[], limit = 5): ClientRevenue[] {
  const byClient = new Map<string, number>();
  for (const rfq of rfqs) {
    const revenue = rfq.totalRevenueUsd ?? 0;
    if (revenue <= 0) continue;
    const name = rfq.client?.companyName || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + revenue);
  }
  return [...byClient.entries()]
    .map(([name, revenueUsd]) => ({ name, revenueUsd }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, limit);
}
