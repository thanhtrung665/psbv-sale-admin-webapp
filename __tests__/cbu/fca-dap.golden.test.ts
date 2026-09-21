/**
 * CBU engine v2 — GOLDEN tests for profile FCA_DAP (Baker Hughes · AC0481).
 * Expected values come from the two Baker Hughes markdown workbooks (see fixtures/ac0481.ts). Written BEFORE the engine.
 */
import { calculateCbu, type CbuLineInput, type CbuParamsInput } from "../../src/lib/cbu";
import { finalizeBlockers } from "../../src/lib/cbu/finalize";
import { AC0481_EXPECTED as E, AC0481_LINE as L, AC0481_PARAMS as P, AC0481_SCENARIOS as S } from "./fixtures/ac0481";

type ScenarioKey = keyof typeof S;

const line = (over: Partial<CbuLineInput> = {}): CbuLineInput => ({
  id: L.id, lineNo: L.lineNo, qty: L.qty, materialUsd: L.materialUsd, totalWeightLb: L.totalWeightLb, ...over,
});

function params(scenario: ScenarioKey, extra: CbuParamsInput = {}): CbuParamsInput {
  const s = S[scenario];
  return {
    profile: "FCA_DAP",
    mode: "MARGIN_INPUT",
    targetMarginPct: P.targetMarginPct,
    goodsOrigin: P.goodsOrigin,
    destinationCountry: P.destinationCountry,
    interestPct: P.interestPct,
    daysPerYear: P.daysPerYear,
    pctFinanced: s.pctFinanced,
    financingDays: s.financingDays,
    // FCA_DAP reuses two freight fields: all-in = the freight quoted (Excel P16), fixed = the Logistic-sheet reference
    logistics: { freightAllInUsd: s.freightQuotedUsd, freightFixedUsd: s.freightReferenceUsd },
    bank: { receiveBaseUsd: P.receiveBaseUsd },
    ...extra,
  };
}

const close = (a: number, b: number, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("bank fee pool (Bank Fee sheet)", () => {
  it("remittance min $50 + receive min $35 = $85, allocated by material value", () => {
    const r = calculateCbu([line()], params("paymentWithOrder"));
    expect(r.pools.remittanceFeeUsd).toBeCloseTo(E.remittanceFeeUsd, 9);
    expect(r.pools.receiveFeeUsd).toBeCloseTo(E.receiveFeeUsd, 9);
    expect(r.pools.bankTotalUsd).toBeCloseTo(E.bankTotalUsd, 9);
  });

  it("Local goods waive the remittance fee; a Vietnamese customer waives the receive fee", () => {
    expect(calculateCbu([line()], params("paymentWithOrder", { goodsOrigin: "Local" })).pools.bankTotalUsd).toBeCloseTo(35, 9);
    expect(calculateCbu([line()], params("paymentWithOrder", { destinationCountry: "VN" })).pools.bankTotalUsd).toBeCloseTo(50, 9);
  });
});

describe.each(["paymentWithOrder", "net60"] as const)("FCA_DAP · MARGIN_INPUT · %s", (key) => {
  const r = calculateCbu([line()], params(key));
  const l = r.lines[0];
  const dap = E[key].dap;

  it("FCA block = Excel: unit cost 108.33, price 131, revenue 3,930, margin 680 (17.30%)", () => {
    const f = l.fca!;
    close(f.financialUsd, E.fca.financialUsd);
    close(f.unitCostUsd, E.fca.unitCostUsd);
    expect(f.priceUsd).toBe(E.fca.priceUsd);
    expect(f.totalRevenueUsd).toBe(E.fca.revenueUsd);
    close(f.totalCostUsd, E.fca.costUsd, 1e-3);
    close(f.totalMarginUsd, E.fca.marginUsd, 1e-3);
    close(f.marginPct, E.fca.marginPct, 1e-3);
  });

  it("DAP block = Excel (credit interest applies to DAP only)", () => {
    const d = l.dap!;
    close(d.financialUsd, dap.financialUsd);
    close(d.unitCostUsd, dap.unitCostUsd);
    expect(d.priceUsd).toBe(dap.priceUsd);
    expect(d.totalRevenueUsd).toBe(dap.revenueUsd);
    close(d.totalCostUsd, dap.costUsd, 1e-3);
    close(d.totalMarginUsd, dap.marginUsd, 1e-3);
    close(d.marginPct, dap.marginPct, 1e-3);
  });

  it("DAP offer = goods + the quoted freight added ONCE at order level (G16 = G15 + P16)", () => {
    expect(r.dap!.goodsRevenueUsd).toBe(dap.revenueUsd);
    expect(r.dap!.freightUsd).toBe(S[key].freightQuotedUsd);
    expect(r.dap!.totalUsd).toBe(E[key].totalUsd);
    expect(r.dap!.freightMismatchUsd).toBeCloseTo(E[key].freightMismatchUsd, 9);
  });

  it("the freight mismatch is a WARNING, not a failed check (sheet: 'CẢNH BÁO chênh lệch freight')", () => {
    const warned = r.warnings.some((w) => /cước/i.test(w));
    expect(warned).toBe(E[key].freightMismatchUsd > 0);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("the primary fields follow the quote basis (default FCA) and the totals are that basis", () => {
    expect(r.profile).toBe("FCA_DAP");
    expect(l.ddpPriceUsd).toBe(E.fca.priceUsd);
    close(l.unitCostUsd, E.fca.unitCostUsd);
    expect(r.totals.revenueUsd).toBe(E.fca.revenueUsd);
    expect(r.totals.marginPct).toBeCloseTo(E.fca.marginPct, 3);
  });

  it("nothing from the DDP profile leaks in: no logistics, duty, commission, CIT or insurance", () => {
    expect(l.logisticsUsd).toBe(0);
    expect(l.dutyUsd).toBe(0);
    expect(l.commissionUsd).toBe(0);
    expect(l.citUsd).toBe(0);
    expect(r.pools.insuranceUsd).toBe(0);
    expect(r.pools.logisticsPoolUsd).toBe(0);
  });
});

describe("FCA_DAP · quote basis", () => {
  it("DAP basis: the primary fields and totals switch to the DAP block (Net 60 → 133 / 3,990)", () => {
    const r = calculateCbu([line()], params("net60", { quoteBasis: "DAP" }));
    expect(r.lines[0].ddpPriceUsd).toBe(133);
    close(r.lines[0].unitCostUsd, E.net60.dap.unitCostUsd);
    expect(r.totals.revenueUsd).toBe(3990);
    expect(r.totals.marginPct).toBeCloseTo(E.net60.dap.marginPct, 3);
    // both blocks are still there
    expect(r.lines[0].fca!.priceUsd).toBe(131);
    expect(r.lines[0].dap!.priceUsd).toBe(133);
  });
});

describe("FCA_DAP · PRICE_INPUT (md 'PRICE INPUT' workbook)", () => {
  it.each([
    ["paymentWithOrder", 131, 131],
    ["net60", 131, 133],
  ] as const)("%s: typed FCA %i / DAP %i reproduce the costs and derive the margins", (key, fcaPrice, dapPrice) => {
    const r = calculateCbu([line({ ddpPriceUsdInput: fcaPrice, dapPriceUsdInput: dapPrice })], params(key, { mode: "PRICE_INPUT" }));
    const l = r.lines[0];
    close(l.fca!.unitCostUsd, E.fca.unitCostUsd);
    close(l.dap!.unitCostUsd, E[key].dap.unitCostUsd);
    expect(l.fca!.priceUsd).toBe(fcaPrice);
    expect(l.dap!.priceUsd).toBe(dapPrice);
    close(l.fca!.marginPct, 17.3, 0.05); // md 17.3%
    close(l.dap!.marginPct, key === "net60" ? 17.1 : 17.3, 0.06); // md 17.1% / 17.3%
    expect(r.dap!.totalUsd).toBe(E[key].totalUsd);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("a missing typed price is a pricing failure on that block, not a silent 0", () => {
    const r = calculateCbu([line({ ddpPriceUsdInput: 131 })], params("net60", { mode: "PRICE_INPUT" }));
    expect(r.lines[0].fca!.pricingFailed).toBe(false);
    expect(r.lines[0].dap!.pricingFailed).toBe(true);
    expect(r.warnings.some((w) => /DAP/.test(w))).toBe(true);
  });
});

describe("FCA_DAP · overrides and allocation", () => {
  it("a per-line margin % override replaces the target for that line (17% → 20%: 108.33 ÷ 0.8 → 136)", () => {
    const r = calculateCbu([line({ marginPctOverride: 20 })], params("paymentWithOrder"));
    expect(r.lines[0].fca!.priceUsd).toBe(136);
    expect(r.lines[0].fca!.marginPct).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it("a margin $/unit override wins over the margin %", () => {
    const r = calculateCbu([line({ marginPctOverride: 40, marginUsdOverride: 30 })], params("paymentWithOrder"));
    expect(r.lines[0].fca!.priceUsd).toBe(139); // 108.33 + 30 = 138.33 → 139
  });

  it("bank fees are allocated by material value across several lines (Σ qty × financial = pool)", () => {
    const lines = [line(), line({ id: "l2", lineNo: 2, qty: 10, materialUsd: 40 }), line({ id: "l3", lineNo: 3, qty: 5, materialUsd: 200 })];
    const r = calculateCbu(lines, params("paymentWithOrder", { bank: { receiveBaseUsd: 5000 } }));
    const allocated = r.lines.reduce((s, x) => s + x.qty * x.fca!.financialUsd, 0);
    expect(allocated).toBeCloseTo(r.pools.bankTotalUsd, 6);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.lines[2].fca!.financialUsd).toBeGreaterThan(r.lines[1].fca!.financialUsd); // dearer item carries more
  });

  it("weight has no influence on any price (it only serves the freight reference)", () => {
    const a = calculateCbu([line()], params("net60"));
    const b = calculateCbu([line({ totalWeightLb: 0 })], params("net60"));
    expect(b.lines[0].fca!.priceUsd).toBe(a.lines[0].fca!.priceUsd);
    expect(b.lines[0].dap!.priceUsd).toBe(a.lines[0].dap!.priceUsd);
    expect(b.warnings.some((w) => /trọng lượng/i.test(w))).toBe(false); // no weight warnings in this profile
  });

  it("margin ≥ 100% cannot be priced: a warning and a failed block, never Infinity", () => {
    const r = calculateCbu([line()], params("paymentWithOrder", { targetMarginPct: 100 }));
    expect(r.lines[0].fca!.pricingFailed).toBe(true);
    expect(Number.isFinite(r.lines[0].fca!.priceUsd)).toBe(true);
  });

  it("asks for the contract value when the customer is outside VN and none was typed", () => {
    const r = calculateCbu([line()], params("paymentWithOrder", { bank: { receiveBaseUsd: 0 } }));
    expect(r.warnings.some((w) => /hợp đồng|receiveBase/i.test(w))).toBe(true);
  });
});

describe("FCA_DAP · finalize gate", () => {
  const lines = [line()];
  const blockers = (over: Partial<CbuLineInput> = {}, extra: CbuParamsInput = {}) => {
    const ls = [line(over)];
    return finalizeBlockers(ls, calculateCbu(ls, params("paymentWithOrder", extra)));
  };

  it("a complete sheet passes, and weight is NOT required", () => {
    expect(finalizeBlockers(lines, calculateCbu(lines, params("net60")))).toEqual([]);
    expect(blockers({ totalWeightLb: 0 })).toEqual([]);
  });

  it("requires the material cost and, in PRICE_INPUT, BOTH typed prices", () => {
    expect(blockers({ materialUsd: 0 })).toEqual(expect.arrayContaining(["Dòng 1: chưa có giá gốc (Material Cost)."]));
    const r = blockers({ ddpPriceUsdInput: 131 }, { mode: "PRICE_INPUT" });
    expect(r.some((x) => /DAP/.test(x))).toBe(true);
    expect(r.some((x) => /FCA/.test(x))).toBe(false);
  });
});

describe("FCA_DAP · robustness", () => {
  it("garbage input yields only finite numbers", () => {
    const bad = [{ id: "g", qty: NaN, materialUsd: "abc", totalWeightLb: null }] as unknown as CbuLineInput[];
    const r = calculateCbu([line(), ...bad], { profile: "FCA_DAP", pctFinanced: "x", logistics: { freightAllInUsd: NaN } } as unknown as CbuParamsInput);
    const nonFinite: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "number" && !Number.isFinite(v)) nonFinite.push(path);
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    };
    walk(r, "r");
    expect(nonFinite).toEqual([]);
  });

  it("an empty sheet is fine", () => {
    const r = calculateCbu([], { profile: "FCA_DAP" });
    expect(r.lines).toEqual([]);
    expect(r.dap?.totalUsd ?? 0).toBe(0);
  });

  it("uses the Baker defaults when nothing is given (whole-dollar prices, target 17%, no commission)", () => {
    const r = calculateCbu([line()], { profile: "FCA_DAP", bank: { receiveBaseUsd: 3930 } });
    expect(r.lines[0].fca!.priceUsd).toBe(131);
    expect(r.lines[0].commissionUsd).toBe(0);
  });
});
