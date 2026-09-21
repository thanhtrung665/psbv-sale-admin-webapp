/**
 * Audit core (scripts/cbu-audit.ts): stored price vs the corrected v2 price, on the AC0084 AIR data.
 */
import { auditRfqs, auditToCsv, type AuditRfq } from "../../../src/lib/cbu/db/audit";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS } from "../fixtures/ac0084";

const air = AC0084_LOGISTICS.air;
const P = AC0084_PARAMS;

function rfq(overrides: Partial<AuditRfq> = {}, storedPrice: (i: number) => number | null = () => null, margin: number | null = null): AuditRfq {
  return {
    rfqCode: "RFQ-1",
    status: "QUOTED_TO_CLIENT",
    client: { companyName: 'Hoang "Son", Co' },
    totalRevenueUsd: 30000,
    exchangeRate: P.fx,
    vndRoundingStep: P.vndRoundingStep,
    lbToKg: P.lbToKg,
    freightFixed: air.freightFixedUsd,
    freightRatePerKg: air.freightRatePerKg,
    chargeableWeightKg: air.chargeableKg,
    clearanceCost: air.clearanceUsd,
    inlandCost: air.inlandUsd,
    docFee: 0,
    items: AC0084_AIR.map((r, i) => ({
      id: `l${r.lineNo}`,
      lineNo: r.lineNo,
      rawPartNumber: r.partNo,
      qty: r.qty,
      supplierUnitPrice: r.materialUsd,
      extWeightLbs: r.totalWeightLb,
      dutyPercent: r.dutyPct,
      marginPercent: margin,
      ddpPriceUsd: storedPrice(i),
    })),
    ...overrides,
  };
}

describe("auditRfqs", () => {
  it("a price that already equals the Excel price shows zero difference and is not flagged", () => {
    const { rows, summary } = auditRfqs([rfq({}, (i) => AC0084_AIR[i].expected.ddpPriceUsd)]);
    expect(rows).toHaveLength(16);
    rows.forEach((r, i) => {
      expect(r.v2DdpUsd).toBeCloseTo(AC0084_AIR[i].expected.ddpPriceUsd, 9);
      expect(r.deltaUsd).toBe(0);
      expect(r.deltaPct).toBe(0);
      expect(r.selfChecksOk).toBe(true);
    });
    expect(summary).toMatchObject({ rfqs: 1, lines: 16, flagged: 0, maxAbsPct: 0 });
  });

  it("flags a line priced by the OLD engine (7.49 stored vs 7.10 corrected)", () => {
    const { rows, summary } = auditRfqs([rfq({}, (i) => (i === 0 ? 7.49 : AC0084_AIR[i].expected.ddpPriceUsd))]);
    expect(rows[0]).toMatchObject({ storedDdpUsd: 7.49, v2DdpUsd: 7.1, deltaUsd: -0.39 });
    expect(rows[0].deltaPct).toBeCloseTo(-5.21, 2);
    expect(summary.flagged).toBe(1);
    expect(summary.maxAbsPct).toBeCloseTo(5.21, 2);
  });

  it("reads a stored margin of 0 or 25 as 'no override' — unless --keep-margins", () => {
    const stored = (i: number) => AC0084_AIR[i].expected.ddpPriceUsd;
    for (const artefact of [0, 25]) {
      expect(auditRfqs([rfq({}, stored, artefact)]).summary.flagged).toBe(0);
    }
    // kept: a 0% margin override really changes the price
    expect(auditRfqs([rfq({}, stored, 0)], { keepMargins: true }).summary.flagged).toBeGreaterThan(0);
    // a genuine override (32.5%) is always honoured
    expect(auditRfqs([rfq({}, stored, 32.5)]).summary.flagged).toBeGreaterThan(0);
  });

  it("lines without a stored price are listed with a note, not flagged", () => {
    const { rows, summary } = auditRfqs([rfq()]);
    expect(rows[0]).toMatchObject({ storedDdpUsd: null, deltaUsd: null, deltaPct: null, note: "no stored price" });
    expect(summary.flagged).toBe(0);
  });

  it("a line with no material cost is listed as not comparable - it never counts as a difference", () => {
    const r = rfq({}, () => 0);
    r.items = r.items.map((i) => ({ ...i, supplierUnitPrice: null }));
    const { rows, summary } = auditRfqs([r]);
    expect(rows[0]).toMatchObject({ deltaUsd: null, deltaPct: null, note: "no material cost stored - cannot be priced" });
    expect(summary).toMatchObject({ flagged: 0, unpriceable: 16, maxAbsPct: 0 });
  });

  it("works on a row that has none of the cbu_v2 columns (audit runs before the migration)", () => {
    const legacy = rfq();
    for (const k of ["cbuMode", "targetMarginPercent", "commissionRate", "citOnCommission"] as const) expect(legacy).not.toHaveProperty(k);
    expect(() => auditRfqs([legacy])).not.toThrow();
  });

  it("CSV: header + one line per item, quotes and commas escaped, booleans as yes/NO", () => {
    const { rows } = auditRfqs([rfq({}, (i) => AC0084_AIR[i].expected.ddpPriceUsd)]);
    const lines = auditToCsv(rows).trimEnd().split("\n");
    expect(lines).toHaveLength(17);
    expect(lines[0]).toBe("rfqCode,status,client,lineNo,partNo,qty,storedDdpUsd,v2DdpUsd,deltaUsd,deltaPct,storedRevenueUsd,v2RevenueUsd,selfChecksOk,note");
    expect(lines[1]).toContain('"Hoang ""Son"", Co"');
    expect(lines[1]).toContain(",yes,");
  });
});
