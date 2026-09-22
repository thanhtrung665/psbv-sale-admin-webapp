// src/lib/analytics/types.ts
// Input/output shapes for src/lib/analytics/aggregate.ts. Kept separate from Prisma's generated types so the
// aggregation functions stay pure and framework-agnostic (SPEC.md §12.3) — callers pass in exactly the fields
// they already fetched, nothing more.

/** The subset of an RFQ row every aggregation function in this module needs. */
export interface AnalyticsRfqRow {
  status: string;
  createdAt: Date;
  totalRevenueUsd: number | null;
  totalMarginUsd: number | null;
  client: { companyName: string } | null;
}

export interface MonthlyRevenuePoint {
  /** "YYYY-MM", chronological order. */
  month: string;
  /** Short label for chart axes, e.g. "T1/26". */
  label: string;
  revenueUsd: number;
  marginUsd: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface ClientRevenue {
  name: string;
  revenueUsd: number;
}
