/**
 * The pre-v2 API `calculateCBU(items, globals)` must return the SAME numbers as the v2 engine
 * (and therefore as Excel) — it only re-shapes them for cbu-calc/page.tsx and cbu-form.tsx.
 * Removed together with the legacy page (SPEC §11.11 phase C5).
 */
import { calculateCBU, type CBUGlobals, type CBUItemEngineData } from "../../lib/cbu-engine";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS, AC0084_TOTALS } from "./fixtures/ac0084";

const air = AC0084_LOGISTICS.air;

const GLOBALS: CBUGlobals = {
  exchangeRate: AC0084_PARAMS.fx,
  vndRoundingStep: AC0084_PARAMS.vndRoundingStep,
  lbToKg: AC0084_PARAMS.lbToKg,
  targetMarginPercent: AC0084_PARAMS.targetMarginPct,
  percentValueFinanced: AC0084_PARAMS.pctFinanced,
  interestRatePercent: AC0084_PARAMS.interestPct,
  financingDays: AC0084_PARAMS.financingDays,
  daysPerYear: AC0084_PARAMS.daysPerYear,
  freightFixed: air.freightFixedUsd,
  freightRatePerKg: air.freightRatePerKg,
  chargeableWeightKg: air.chargeableKg,
  clearanceCost: air.clearanceUsd,
  inlandCost: air.inlandUsd,
  insuredValuePercent: AC0084_PARAMS.insurance.insuredValuePct,
  insuranceRatePercent: AC0084_PARAMS.insurance.ratePct,
  minInsuranceUsd: AC0084_PARAMS.insurance.minUsd,
  remittanceRatePercent: AC0084_PARAMS.bank.remitRatePct,
  bankVatFactor: AC0084_PARAMS.bank.remitVatFactor,
  minRemittanceFeeUsd: AC0084_PARAMS.bank.minRemitUsd,
  receiveRatePercent: AC0084_PARAMS.bank.receiveRatePct,
  minReceiveFeeUsd: AC0084_PARAMS.bank.minReceiveUsd,
  goodsOrigin: AC0084_PARAMS.goodsOrigin,
  destinationCountry: AC0084_PARAMS.destinationCountry,
  cbuMode: "MARGIN_INPUT",
  customColumns: [],
};

// `netWeightLbs` in the legacy API is the weight of ONE unit (DB meaning) = Excel total ÷ qty.
const ITEMS: CBUItemEngineData[] = AC0084_AIR.map((r) => ({
  id: `l${r.lineNo}`,
  lineNo: r.lineNo,
  rawPartNumber: r.partNo,
  uom: "PCS",
  qty: r.qty,
  supplierUnitPrice: r.materialUsd,
  netWeightLbs: r.totalWeightLb / r.qty,
  dutyPercent: r.dutyPct,
  commissionPercent: AC0084_PARAMS.commissionPct,
  citPercent: AC0084_PARAMS.citPct,
  marginPercent: null,
  customValues: {},
}));

describe("legacy calculateCBU adapter", () => {
  const result = calculateCBU(ITEMS, GLOBALS);

  it("reproduces every Excel line (DDP USD/VND, unit cost, logistics incl. insurance, bank fee)", () => {
    result.items.forEach((item, i) => {
      const e = AC0084_AIR[i].expected;
      expect(item.ddpPriceUsd).toBeCloseTo(e.ddpPriceUsd, 9);
      expect(item.ddpPriceVnd).toBe(e.ddpPriceVnd);
      expect(Math.abs((item.unitCostUsd ?? 0) - e.unitCostUsd)).toBeLessThanOrEqual(6e-5);
      expect(Math.abs((item.logisticsPerUnit ?? 0) - e.logisticsUsd)).toBeLessThanOrEqual(6e-5);
      expect(Math.abs((item.bankFeePerUnit ?? 0) - e.bankFeeUsd)).toBeLessThanOrEqual(6e-5);
    });
  });

  it("matches the Excel totals", () => {
    expect(result.totalRevenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(result.totalCostUsd).toBeCloseTo(AC0084_TOTALS.air.unitCostUsd, 2);
    expect(result.totalBankFeeUsd + result.totalFinancingCostUsd).toBeCloseTo(AC0084_TOTALS.air.bankFeeUsd, 3);
    expect(result.logisticsPoolUsd).toBeCloseTo(air.expectedPoolUsd, 9);
    expect(result.totalLogisticsUsd).toBeCloseTo(4000, 9); // freight + clearance + inland, insurance excluded
    expect(result.totalInsuranceUsd).toBeCloseTo(15, 9);
  });

  it("apportionedLogistics + apportionedInsurance re-adds to the whole pool (no double counting)", () => {
    const sum = result.items.reduce((s, i) => s + (i.apportionedLogistics ?? 0) + (i.apportionedInsurance ?? 0), 0);
    expect(sum).toBeCloseTo(air.expectedPoolUsd, 6);
  });

  it("treats commission 3 as 3% (not 300%) and 0.03 as 0.03% (not 3%)", () => {
    const three = calculateCBU([ITEMS[0]], GLOBALS).items[0];
    expect(three.commissionPerUnit).toBeCloseTo(0.03 * (three.ddpPriceUsd ?? 0), 9);
    const tiny = calculateCBU([{ ...ITEMS[0], commissionPercent: 0.03 }], GLOBALS).items[0];
    expect(tiny.commissionPerUnit).toBeCloseTo(0.0003 * (tiny.ddpPriceUsd ?? 0), 9);
  });

  it("keeps a null margin override as 'use the target' (25%) — never 0%", () => {
    result.items.forEach((i) => expect(i.marginPercentActual).toBeGreaterThan(24.9));
  });

  it("supports PRICE_INPUT via targetDdpPriceUsd", () => {
    const priced = ITEMS.map((it, i) => ({ ...it, targetDdpPriceUsd: AC0084_AIR[i].expected.ddpPriceUsd }));
    const r = calculateCBU(priced, { ...GLOBALS, cbuMode: "PRICE_INPUT" });
    expect(r.totalRevenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
  });

  it("warns when lines carry different commission/CIT (no longer supported per line)", () => {
    const r = calculateCBU([ITEMS[0], { ...ITEMS[1], commissionPercent: 5 }], GLOBALS);
    expect(r.warnings.some((w) => /Commission/i.test(w))).toBe(true);
  });

  it("does not crash on empty input and returns finite numbers", () => {
    const r = calculateCBU([], { exchangeRate: 26500, customColumns: [] });
    expect(r.items).toEqual([]);
    expect(Number.isFinite(r.effectiveMarginPct)).toBe(true);
  });
});
