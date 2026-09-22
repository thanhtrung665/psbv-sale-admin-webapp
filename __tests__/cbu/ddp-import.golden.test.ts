/**
 * CBU engine v2 — GOLDEN tests for profile DDP_IMPORT (Hoàng Sơn · AC0084).
 *
 * Expected values come from documents/CBU_docx/CBU_Margin_Input/CBU-AC0084_DDP_VN_MARGIN_INPUT.md
 * via scripts/gen-cbu-fixture.mjs. Never edit fixtures to make a test pass (SPEC §11.6-6).
 * Always compare PER LINE, not only totals: the pre-v2 bugs cancelled out in the totals (SPEC §11.2 F2b).
 */
import { calculateCbu, type CbuLineInput, type CbuParamsInput } from "../../src/lib/cbu";
import {
  AC0084_AIR,
  AC0084_SEA,
  AC0084_PARAMS,
  AC0084_LOGISTICS,
  AC0084_TOTALS,
  AC0084_EXPECTED_BANK_TOTAL_USD,
  type Ac0084Row,
} from "./fixtures/ac0084";

// The md prints cost columns with 4 decimals → max rounding error 5e-5.
const COST_TOL = 6e-5;

function toLines(rows: Ac0084Row[]): CbuLineInput[] {
  return rows.map((r) => ({
    id: `l${r.lineNo}`,
    lineNo: r.lineNo,
    qty: r.qty,
    materialUsd: r.materialUsd,
    totalWeightLb: r.totalWeightLb,
    dutyPct: r.dutyPct,
  }));
}

function paramsFor(scenario: "air" | "sea", extra: CbuParamsInput = {}): CbuParamsInput {
  return {
    ...AC0084_PARAMS,
    logistics: { ...AC0084_LOGISTICS[scenario] },
    mode: "MARGIN_INPUT",
    ...extra,
  };
}

const CASES = [
  { name: "AIR", scenario: "air" as const, rows: AC0084_AIR, totals: AC0084_TOTALS.air },
  { name: "SEA", scenario: "sea" as const, rows: AC0084_SEA, totals: AC0084_TOTALS.sea },
];

describe.each(CASES)("DDP_IMPORT · MARGIN_INPUT · $name block", ({ scenario, rows, totals }) => {
  const result = calculateCbu(toLines(rows), paramsFor(scenario));

  it("builds the logistics pool exactly like the Logistic sheet (freight + clearance + inland + insurance)", () => {
    const l = AC0084_LOGISTICS[scenario];
    expect(result.pools.freightUsd).toBeCloseTo(l.expectedFreightUsd, 9);
    // Insurance = MAX((goods + freight) × 110% × 0.01%, min 15) → the minimum applies here.
    expect(result.pools.insuranceUsd).toBeCloseTo(l.expectedInsuranceUsd, 9);
    expect(result.pools.logisticsPoolUsd).toBeCloseTo(l.expectedPoolUsd, 9);
  });

  it("builds the bank fee pool exactly like the Bank Fee sheet", () => {
    expect(result.pools.remittanceFeeUsd).toBeCloseTo(AC0084_EXPECTED_BANK_TOTAL_USD, 9);
    expect(result.pools.receiveFeeUsd).toBe(0); // Country = VN
    expect(result.pools.bankTotalUsd).toBeCloseTo(AC0084_EXPECTED_BANK_TOTAL_USD, 9);
  });

  it.each(rows.map((r) => [r.lineNo, r] as const))("line %i matches the Excel row", (_no, row) => {
    const line = result.lines.find((l) => l.lineNo === row.lineNo)!;
    const e = row.expected;

    expect(line.weightKgPerUnit).toBeCloseTo(row.weightKg, 4);
    expect(Math.abs(line.bankFeeUsd - e.bankFeeUsd)).toBeLessThanOrEqual(COST_TOL);
    expect(Math.abs(line.logisticsUsd - e.logisticsUsd)).toBeLessThanOrEqual(COST_TOL);
    expect(Math.abs(line.dutyUsd - e.dutyUsd)).toBeLessThanOrEqual(COST_TOL);
    expect(Math.abs(line.commissionUsd - e.commissionUsd)).toBeLessThanOrEqual(COST_TOL);
    expect(Math.abs(line.citUsd - e.citUsd)).toBeLessThanOrEqual(COST_TOL);
    expect(Math.abs(line.unitCostUsd - e.unitCostUsd)).toBeLessThanOrEqual(COST_TOL);

    // Prices are ROUNDUP'd, so they must match the md exactly.
    expect(line.ddpPriceUsd).toBeCloseTo(e.ddpPriceUsd, 9);
    expect(line.ddpPriceVnd).toBe(e.ddpPriceVnd);
    expect(line.totalRevenueVnd).toBe(e.totalRevenueVnd);

    // md prints these to 2 decimals / whole numbers.
    expect(Math.abs(line.marginPerUnitUsd - e.marginPerUnitUsd)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(line.marginPct - e.marginPct)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(line.totalMarginUsd - e.totalMarginUsd)).toBeLessThanOrEqual(0.5001);
    expect(Math.abs(line.totalCostUsd - e.totalCostUsd)).toBeLessThanOrEqual(0.5001);
  });

  it("matches the Excel TOTAL row", () => {
    const t = result.totals;
    expect(t.qty).toBe(totals.qty);
    expect(t.weightKg).toBeCloseTo(totals.weightKg, 3);
    expect(t.materialUsd).toBeCloseTo(totals.materialUsd, 2);
    expect(t.bankFeeUsd).toBeCloseTo(totals.bankFeeUsd, 3);
    expect(t.logisticsUsd).toBeCloseTo(totals.logisticsUsd, 2);
    expect(t.dutyUsd).toBeCloseTo(totals.dutyUsd, 6);
    expect(t.commissionUsd).toBeCloseTo(totals.commissionUsd, 2);
    expect(t.citUsd).toBeCloseTo(totals.citUsd, 2);
    expect(t.costUsd).toBeCloseTo(totals.unitCostUsd, 2);
    expect(t.revenueUsd).toBeCloseTo(totals.ddpPriceUsd, 2);
    expect(t.revenueVnd).toBe(totals.totalRevenueVnd);
    expect(Math.abs(t.marginPct - totals.marginPct)).toBeLessThanOrEqual(0.0051);
  });

  it("passes every self-check (Excel CHECK rows)", () => {
    expect(result.checks.length).toBeGreaterThanOrEqual(4);
    const failed = result.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
  });

  it("has no warnings on clean data", () => {
    expect(result.warnings).toEqual([]);
  });
});

describe("DDP_IMPORT · PRICE_INPUT round-trip (md 'PRICE INPUT' workbook)", () => {
  it.each(CASES)("$name: feeding back the margin-mode prices reproduces cost & margin", ({ scenario, rows, totals }) => {
    const margin = calculateCbu(toLines(rows), paramsFor(scenario));
    const priced = toLines(rows).map((l, i) => ({ ...l, ddpPriceUsdInput: margin.lines[i].ddpPriceUsd }));
    const price = calculateCbu(priced, paramsFor(scenario, { mode: "PRICE_INPUT" }));

    price.lines.forEach((l, i) => {
      expect(l.ddpPriceUsd).toBeCloseTo(margin.lines[i].ddpPriceUsd, 9);
      expect(l.unitCostUsd).toBeCloseTo(margin.lines[i].unitCostUsd, 9);
      expect(l.marginPct).toBeCloseTo(margin.lines[i].marginPct, 9);
    });
    expect(price.totals.revenueVnd).toBe(totals.totalRevenueVnd);
    expect(Math.abs(price.totals.marginPct - totals.marginPct)).toBeLessThanOrEqual(0.0051);
    expect(price.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("margin % is a RESULT: a lower price gives a lower margin, a price below cost gives a negative margin", () => {
    const lines = toLines(AC0084_AIR).slice(0, 1).map((l) => ({ ...l, ddpPriceUsdInput: 5 }));
    const r = calculateCbu(lines, paramsFor("air", { mode: "PRICE_INPUT" }));
    expect(r.lines[0].ddpPriceUsd).toBe(5);
    expect(r.lines[0].marginPerUnitUsd).toBeLessThan(0);
    expect(r.lines[0].marginPct).toBeLessThan(0);
  });
});

describe("DDP_IMPORT · per-line margin overrides (md §3 note)", () => {
  const base = toLines(AC0084_AIR).slice(0, 2);
  const p = paramsFor("air");

  it("margin % override replaces the target for that line only", () => {
    const r = calculateCbu([{ ...base[0], marginPctOverride: 40 }, base[1]], p);
    expect(r.lines[0].marginPct).toBeGreaterThanOrEqual(40 - 1e-9);
    expect(r.lines[0].marginPct).toBeLessThan(41);
    expect(r.lines[1].marginPct).toBeGreaterThanOrEqual(25 - 1e-9);
    expect(r.lines[1].marginPct).toBeLessThan(26);
  });

  it("margin $/unit override wins over margin % (highest priority) and yields exactly cost + $", () => {
    const r = calculateCbu([{ ...base[0], marginPctOverride: 40, marginUsdOverride: 2 }, base[1]], p);
    const l = r.lines[0];
    // DDP is ROUNDUP'd to cents, so realised margin is >= the requested $2 and < $2.01 more.
    expect(l.marginPerUnitUsd).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(l.marginPerUnitUsd).toBeLessThan(2.05);
  });

  it("an override of 0 / null / undefined means 'no override' (SPEC F6: null must never become 0%)", () => {
    const a = calculateCbu([{ ...base[0], marginPctOverride: null, marginUsdOverride: null }], p).lines[0];
    const b = calculateCbu([{ ...base[0] }], p).lines[0];
    const c = calculateCbu([{ ...base[0], marginUsdOverride: 0 }], p).lines[0];
    expect(a.ddpPriceUsd).toBe(b.ddpPriceUsd);
    expect(c.ddpPriceUsd).toBe(b.ddpPriceUsd);
    expect(b.marginPct).toBeGreaterThan(24.9); // target 25%, not 0%
  });
});

// ─── Named regression tests for the defects documented in SPEC §11.2 ───────────
describe("regressions (SPEC §11.2)", () => {
  const lines = toLines(AC0084_AIR);

  it("F1 · allocated logistics × qty sums back to the pool (it used to allocate 0.35% of it)", () => {
    const r = calculateCbu(lines, paramsFor("air"));
    const allocated = r.lines.reduce((s, l) => s + l.logisticsUsd * l.qty, 0);
    expect(allocated).toBeCloseTo(r.pools.logisticsPoolUsd, 6);
    expect(allocated).toBeGreaterThan(4000);
  });

  it("F2 · percent inputs are always 0-100: duty 1% is 1%, never 100%", () => {
    const one: CbuLineInput[] = [{ id: "a", qty: 1, materialUsd: 100, totalWeightLb: 1, dutyPct: 1 }];
    const r = calculateCbu(one, { ...paramsFor("air"), logistics: { freightFixedUsd: 0 } });
    // No freight (0) + minimum insurance ($15) → CIF base = 100 + 15 → 1% = 1.15 (the old engine gave 100).
    expect(r.lines[0].dutyUsd).toBeCloseTo((100 + r.pools.insuranceUsd) * 0.01, 9);
    expect(r.lines[0].dutyUsd).toBeLessThan(2);
  });

  it("F2 · insurance uses 0.01 as 0.01% (Excel: 15.00 minimum, not $253)", () => {
    const r = calculateCbu(lines, paramsFor("air"));
    expect(r.pools.insuranceUsd).toBeCloseTo(15, 9);
  });

  it("F2 · remittance 0.2 is 0.2% × VAT 1.1 → the $50 minimum applies, not 20% of goods", () => {
    const r = calculateCbu(lines, paramsFor("air"));
    expect(r.pools.remittanceFeeUsd).toBeCloseTo(50, 9);
    expect(r.lines[0].bankFeeUsd).toBeCloseTo(0.025, 3);
  });

  it("F2 · a percentage that happens to be ≤ 1 keeps its meaning (commission 0.5% ≠ 50%)", () => {
    const one: CbuLineInput[] = [{ id: "a", qty: 1, materialUsd: 100, totalWeightLb: 1 }];
    const half = calculateCbu(one, { ...paramsFor("air"), commissionPct: 0.5, logistics: {} }).lines[0];
    expect(half.commissionUsd).toBeCloseTo(0.005 * half.ddpPriceUsd, 9);
    // base ≈ 100 material + 50 minimum remittance + 15 minimum insurance + financing;
    // ÷ (1 − 25% − 0.5%·1.2) ≈ 222. Read as 50% commission the price would be ≈ 1,100.
    expect(half.ddpPriceUsd).toBeLessThan(300);
  });

  it("F3/Q2 · duty base = real CIF (material + allocated freight + allocated insurance), " +
      "NOT the Excel col L formula (material + full logistics, which also bundles customs " +
      "clearance / inland / other local fees — decided 22/09/2026, SPEC §11.12 Q2)", () => {
    const withDuty = lines.map((l) => ({ ...l, dutyPct: 10 }));
    const r = calculateCbu(withDuty, paramsFor("air"));
    const totalWeightKg = r.pools.totalWeightKg;
    for (const l of r.lines) {
      const material = withDuty.find((x) => x.id === l.id)!.materialUsd;
      const share = l.weightKgPerUnit / totalWeightKg;
      const freightShare = r.pools.freightUsd * share;
      const insuranceShare = r.pools.insuranceUsd * share;
      expect(l.dutyUsd).toBeCloseTo((material + freightShare + insuranceShare) * 0.1, 9);
      // Sanity: with non-zero clearance/inland in the AIR fixture, this differs from the old Excel base.
      expect(l.dutyUsd).not.toBeCloseTo((material + l.logisticsUsd) * 0.1, 6);
    }
  });

  it("F4 · per-shipment costs default to 0 — nothing is added the user did not type", () => {
    const r = calculateCbu(lines, { ...paramsFor("air"), logistics: {} });
    expect(r.pools.freightUsd).toBe(0);
    // Only the minimum insurance remains (policy default), no clearance/inland/doc fee.
    expect(r.pools.logisticsPoolUsd).toBeCloseTo(r.pools.insuranceUsd, 9);
  });
});

// ─── Guard rails ──────────────────────────────────────────────────────────────
describe("robustness", () => {
  const sane: CbuLineInput = { id: "a", qty: 10, materialUsd: 5, totalWeightLb: 20 };

  it("returns only finite numbers for garbage input", () => {
    const garbage = [
      { id: "g1", qty: NaN, materialUsd: "abc", totalWeightLb: null, dutyPct: undefined },
      { id: "g2", qty: -5, materialUsd: -1, totalWeightLb: -3, dutyPct: Infinity },
    ] as unknown as CbuLineInput[];
    const r = calculateCbu([sane, ...garbage], { fx: "x", logistics: { freightFixedUsd: NaN } } as unknown as CbuParamsInput);
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "number" && !Number.isFinite(v)) bad.push(path);
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    };
    walk(r, "result");
    expect(bad).toEqual([]);
  });

  it("handles an empty line list", () => {
    const r = calculateCbu([], {});
    expect(r.lines).toEqual([]);
    expect(r.totals.revenueUsd).toBe(0);
    expect(r.pools.insuranceUsd).toBe(0);
    expect(r.pools.remittanceFeeUsd).toBe(0);
  });

  it("warns (and does not invent logistics) when total weight is 0", () => {
    const r = calculateCbu([{ ...sane, totalWeightLb: 0 }], { logistics: { freightFixedUsd: 1000 } });
    expect(r.lines[0].logisticsUsd).toBe(0);
    expect(r.warnings.some((w) => /trọng lượng/i.test(w))).toBe(true);
  });

  it("warns instead of returning a meaningless price when margin + commission ≥ 100%", () => {
    const r = calculateCbu([sane], { targetMarginPct: 90, commissionPct: 15, citPct: 20 });
    expect(r.warnings.some((w) => /margin/i.test(w))).toBe(true);
    expect(Number.isFinite(r.lines[0].ddpPriceUsd)).toBe(true);
    expect(r.lines[0].warnings.length).toBeGreaterThan(0);
  });

  it("charges the inbound bank fee only when Country ≠ VN and asks for the manual base", () => {
    const vn = calculateCbu([sane], { destinationCountry: "VN" });
    const my = calculateCbu([sane], { destinationCountry: "MY" });
    expect(vn.pools.receiveFeeUsd).toBe(0);
    expect(my.pools.receiveFeeUsd).toBeGreaterThan(0);
    expect(my.warnings.some((w) => /receiveBase|hợp đồng/i.test(w))).toBe(true);
  });

  it("waives the outbound remittance fee for Local goods", () => {
    const r = calculateCbu([sane], { goodsOrigin: "Local" });
    expect(r.pools.remittanceFeeUsd).toBe(0);
  });

  it("explicit all-in freight overrides fixed + rate × chargeable weight", () => {
    const r = calculateCbu([sane], { logistics: { freightAllInUsd: 900, freightFixedUsd: 500, freightRatePerKg: 2.5, chargeableKg: 1300 } });
    expect(r.pools.freightUsd).toBe(900);
  });
});
