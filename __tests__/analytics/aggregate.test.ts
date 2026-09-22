import { revenueByMonth, statusBreakdown, topClients } from "../../src/lib/analytics/aggregate";
import { ORDER_STATUSES } from "../../src/lib/order-status";
import type { AnalyticsRfqRow } from "../../src/lib/analytics/types";

function rfq(over: Partial<AnalyticsRfqRow>): AnalyticsRfqRow {
  return {
    status: "QUOTATION_DRAFTED",
    createdAt: new Date("2026-09-15"),
    totalRevenueUsd: null,
    totalMarginUsd: null,
    client: { companyName: "Acme Co" },
    ...over,
  };
}

describe("revenueByMonth", () => {
  const now = new Date("2026-09-22");

  it("zero-fills every month in the window, oldest first", () => {
    const points = revenueByMonth([], 3, now);
    expect(points.map((p) => p.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(points.every((p) => p.revenueUsd === 0 && p.marginUsd === 0)).toBe(true);
  });

  it("sums revenue and margin into the RFQ's created-at month", () => {
    const points = revenueByMonth(
      [
        rfq({ createdAt: new Date("2026-09-01"), totalRevenueUsd: 1000, totalMarginUsd: 200 }),
        rfq({ createdAt: new Date("2026-09-20"), totalRevenueUsd: 500, totalMarginUsd: 50 }),
        rfq({ createdAt: new Date("2026-08-10"), totalRevenueUsd: 300, totalMarginUsd: 30 }),
      ],
      3,
      now
    );
    const sep = points.find((p) => p.month === "2026-09")!;
    const aug = points.find((p) => p.month === "2026-08")!;
    expect(sep.revenueUsd).toBe(1500);
    expect(sep.marginUsd).toBe(250);
    expect(aug.revenueUsd).toBe(300);
  });

  it("ignores RFQs with no price (revenue <= 0) and RFQs outside the window", () => {
    const points = revenueByMonth(
      [
        rfq({ createdAt: new Date("2026-09-01"), totalRevenueUsd: 0 }),
        rfq({ createdAt: new Date("2026-09-01"), totalRevenueUsd: null }),
        rfq({ createdAt: new Date("2025-01-01"), totalRevenueUsd: 9999 }), // way outside a 3-month window
      ],
      3,
      now
    );
    expect(points.reduce((s, p) => s + p.revenueUsd, 0)).toBe(0);
  });

  it("treats a missing totalMarginUsd as 0 without throwing", () => {
    const points = revenueByMonth([rfq({ createdAt: new Date("2026-09-01"), totalRevenueUsd: 100, totalMarginUsd: null })], 1, now);
    expect(points[0].marginUsd).toBe(0);
  });
});

describe("statusBreakdown", () => {
  it("returns one entry per OrderStatus value, in lifecycle order, zero-filled", () => {
    const result = statusBreakdown([]);
    expect(result.map((r) => r.status)).toEqual([...ORDER_STATUSES]);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("counts RFQs into their status bucket", () => {
    const result = statusBreakdown([
      rfq({ status: "INQUIRY_RECEIVED" }),
      rfq({ status: "INQUIRY_RECEIVED" }),
      rfq({ status: "QUOTED_TO_CLIENT" }),
    ]);
    expect(result.find((r) => r.status === "INQUIRY_RECEIVED")!.count).toBe(2);
    expect(result.find((r) => r.status === "QUOTED_TO_CLIENT")!.count).toBe(1);
    expect(result.find((r) => r.status === "RFO_PENDING_ADMIN")!.count).toBe(0);
  });

  it("ignores a row with an unrecognised status instead of throwing", () => {
    const result = statusBreakdown([rfq({ status: "SOME_FUTURE_STATUS" })]);
    expect(result.reduce((s, r) => s + r.count, 0)).toBe(0);
  });
});

describe("topClients", () => {
  it("sums revenue per client and sorts descending", () => {
    const result = topClients([
      rfq({ client: { companyName: "A" }, totalRevenueUsd: 100 }),
      rfq({ client: { companyName: "B" }, totalRevenueUsd: 500 }),
      rfq({ client: { companyName: "A" }, totalRevenueUsd: 50 }),
    ]);
    expect(result).toEqual([
      { name: "B", revenueUsd: 500 },
      { name: "A", revenueUsd: 150 },
    ]);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) => rfq({ client: { companyName: `C${i}` }, totalRevenueUsd: i + 1 }));
    expect(topClients(rows, 3)).toHaveLength(3);
  });

  it("excludes clients with no priced RFQ and falls back to '—' when client is null", () => {
    const result = topClients([
      rfq({ client: { companyName: "Unpriced" }, totalRevenueUsd: 0 }),
      rfq({ client: null, totalRevenueUsd: 200 }),
    ]);
    expect(result).toEqual([{ name: "—", revenueUsd: 200 }]);
  });
});
