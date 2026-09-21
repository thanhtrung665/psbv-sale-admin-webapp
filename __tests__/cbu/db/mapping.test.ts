/**
 * Pure mapping rules between RFQ / RFQItem rows and the CBU engine (SPEC §11.6, §11.8).
 */
import { resolveParams } from "../../../src/lib/cbu/params";
import { CBU_DEFAULTS } from "../../../src/lib/cbu/defaults";
import { calculateCbu } from "../../../src/lib/cbu";
import type { CbuLineInput } from "../../../src/lib/cbu/types";
import { CbuHttpError } from "../../../src/lib/cbu/db/errors";
import {
  applyEdit,
  buildLines,
  finalizeBlockers,
  itemToLine,
  itemUpdateData,
  mergeParams,
  nextStatus,
  normalizeCbuConfig,
  paramsFromRfq,
  paramsToRfqColumns,
  totalWeightLbOf,
  type RfqCbuRow,
} from "../../../src/lib/cbu/db/mapping";

// Every numeric column gets a DIFFERENT value, so a swapped mapping cannot pass by coincidence.
const FULL_ROW: Required<Omit<RfqCbuRow, "status" | "cbuProfile" | "cbuConfig">> & { status: string } = {
  status: "SUPPLIER_QUOTED",
  cbuMode: "PRICE_INPUT",
  exchangeRate: 26111,
  vndRoundingStep: 5000,
  lbToKg: 0.45,
  goodsOrigin: "Local",
  destinationCountry: "MY",
  freightCost: 901,
  freightFixed: 502,
  freightRatePerKg: 2.6,
  chargeableWeightKg: 1301,
  clearanceCost: 151,
  inlandCost: 101,
  docFee: 7,
  insuredValuePercent: 105,
  insuranceRatePercent: 0.02,
  minInsuranceUsd: 16,
  remittanceRatePercent: 0.3,
  bankVatFactor: 1.08,
  minRemittanceFeeUsd: 51,
  receiveRatePercent: 0.06,
  minReceiveFeeUsd: 6,
  receiveBaseUsd: 12345,
  otherBankFeeUsd: 3,
  percentValueFinanced: 60,
  interestRatePercent: 12,
  financingDays: 20,
  daysPerYear: 365,
  targetMarginPercent: 31,
  commissionRate: 4,
  citOnCommission: 15,
};

describe("RFQ columns ⇄ engine params", () => {
  it("round-trips every persisted parameter (columns → params → columns is the identity)", () => {
    const { status, ...columns } = FULL_ROW;
    void status;
    const params = resolveParams(paramsFromRfq(FULL_ROW));
    expect(paramsToRfqColumns(params)).toEqual(columns);
  });

  it("maps a few columns to the intended engine fields (guards against swapped names)", () => {
    const p = resolveParams(paramsFromRfq(FULL_ROW));
    expect(p.mode).toBe("PRICE_INPUT");
    expect(p.fx).toBe(26111);
    expect(p.targetMarginPct).toBe(31);
    expect(p.commissionPct).toBe(4);
    expect(p.citPct).toBe(15);
    expect(p.logistics.freightAllInUsd).toBe(901);
    expect(p.logistics.otherUsd).toBe(7); // docFee → "other shipment charge"
    expect(p.bank.remitVatFactor).toBe(1.08); // bankVatFactor is the REMITTANCE VAT
    expect(p.bank.receiveBaseUsd).toBe(12345);
    expect(p.pctFinanced).toBe(60);
  });

  it("null / missing columns fall back to the engine defaults — shipment costs stay 0", () => {
    const p = resolveParams(paramsFromRfq({ status: "X", clearanceCost: null, inlandCost: null, exchangeRate: null }));
    expect(p.logistics.clearanceUsd).toBe(0);
    expect(p.logistics.inlandUsd).toBe(0);
    expect(p.fx).toBe(CBU_DEFAULTS.fx);
    expect(p.mode).toBe("MARGIN_INPUT");
  });

  it("mergeParams: undefined keeps the stored value, 0 and nested objects override", () => {
    const base = paramsFromRfq(FULL_ROW);
    const merged = mergeParams(base, { fx: undefined, targetMarginPct: 0, logistics: { clearanceUsd: 0, freightFixedUsd: undefined } });
    expect(merged.fx).toBe(26111);
    expect(merged.targetMarginPct).toBe(0);
    expect(merged.logistics?.clearanceUsd).toBe(0);
    expect(merged.logistics?.freightFixedUsd).toBe(502);
    expect(merged.logistics?.inlandUsd).toBe(101);
  });
});

describe("items ⇄ engine lines", () => {
  const item = { id: "i1", lineNo: 1, qty: 320 };

  it("weight: TOTAL lb wins (extWeightLbs), else per-unit × qty", () => {
    expect(totalWeightLbOf({ ...item, extWeightLbs: 121.6, netWeightLbs: 99 })).toBe(121.6);
    expect(totalWeightLbOf({ ...item, extWeightLbs: null, netWeightLbs: 0.38 })).toBeCloseTo(121.6, 9);
    expect(totalWeightLbOf({ ...item, extWeightLbs: 0, netWeightLbs: 0.38 })).toBeCloseTo(121.6, 9);
    expect(totalWeightLbOf({ ...item })).toBe(0);
  });

  it("a NULL margin override stays null — it is never turned into 0% (SPEC F6)", () => {
    const l = itemToLine({ ...item, marginPercent: null, marginOverrideUsd: null });
    expect(l.marginPctOverride).toBeNull();
    expect(l.marginUsdOverride).toBeNull();
    expect(itemToLine({ ...item, marginPercent: 32.5 }).marginPctOverride).toBe(32.5);
  });

  it("applyEdit: only given fields change; null clears an override; per-unit weight uses the STORED qty", () => {
    const base: CbuLineInput = { id: "i1", qty: 320, materialUsd: 4.37, totalWeightLb: 121.6, dutyPct: 5, marginPctOverride: 40, marginUsdOverride: 2 };
    const e1 = applyEdit(base, { id: "i1", marginPctOverride: null });
    expect(e1).toEqual({ ...base, marginPctOverride: null });
    const e2 = applyEdit(base, { id: "i1", weightLbPerUnit: 0.5 });
    expect(e2.totalWeightLb).toBe(160);
    const e3 = applyEdit(base, { id: "i1", weightLbPerUnit: 0.5, totalWeightLb: 10 });
    expect(e3.totalWeightLb).toBe(10);
    const e4 = applyEdit(base, { id: "i1", materialUsd: 0, dutyPct: 0 });
    expect(e4.materialUsd).toBe(0);
    expect(e4.dutyPct).toBe(0);
  });

  it("buildLines rejects edits for lines that are not on this RFQ (400) and touches nothing", () => {
    const items = [item, { id: "i2", lineNo: 2, qty: 1 }];
    try {
      buildLines(items, [{ id: "i1", dutyPct: 1 }, { id: "ghost", dutyPct: 1 }]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CbuHttpError);
      expect((e as CbuHttpError).status).toBe(400);
      expect((e as CbuHttpError).details.join(" ")).toContain("ghost");
    }
    expect(buildLines(items, undefined).map((l) => l.id)).toEqual(["i1", "i2"]);
  });
});

describe("itemUpdateData — what is written back to RFQItem", () => {
  const params = resolveParams({ commissionPct: 3, citPct: 20, logistics: { freightFixedUsd: 500 } });
  const line: CbuLineInput = { id: "i1", lineNo: 1, qty: 10, materialUsd: 5, totalWeightLb: 20, dutyPct: 0, marginPctOverride: null, marginUsdOverride: 0 };
  const res = calculateCbu([line], params).lines[0];

  it("persists inputs, derived per-unit weight, null overrides and line totals with the legacy column meaning", () => {
    const d = itemUpdateData({ id: "i1", lineNo: 1, qty: 10 }, line, res, params);
    expect(d.supplierUnitPrice).toBe(5);
    expect(d.supplierExtPrice).toBe(50);
    expect(d.extWeightLbs).toBe(20);
    expect(d.netWeightLbs).toBe(2); // 20 lb ÷ 10 units
    expect(d.marginPercent).toBeNull();
    expect(d.marginOverrideUsd).toBeNull(); // 0 = "not used" is stored as NULL
    expect(d.commissionPercent).toBe(3);
    expect(d.citPercent).toBe(20);
    // apportionedLogistics + apportionedInsurance = the whole allocated pool share, no double count
    const total = (d.apportionedLogistics as number) + (d.apportionedInsurance as number);
    expect(total).toBeCloseTo(res.logisticsUsd * 10, 9);
    expect(d.ddpPriceVnd).toBe(BigInt(Math.round(res.ddpPriceVnd)));
  });

  it("keeps a real $ override, and does not overwrite netWeightLbs when qty is 0", () => {
    const zeroQty = { ...line, qty: 0, marginUsdOverride: 1.5 };
    const r0 = calculateCbu([zeroQty], params).lines[0];
    const d = itemUpdateData({ id: "i1", lineNo: 1, qty: 0 }, zeroQty, r0, params);
    expect(d.marginOverrideUsd).toBe(1.5);
    expect("netWeightLbs" in d).toBe(false);
  });
});

describe("status policy", () => {
  it.each([
    ["INQUIRY_RECEIVED", "draft", "CBU_PENDING_ADMIN"],
    ["SUPPLIER_QUOTED", "draft", "CBU_PENDING_ADMIN"],
    ["CBU_PENDING_ADMIN", "draft", "CBU_PENDING_ADMIN"],
    ["QUOTATION_DRAFTED", "draft", "CBU_PENDING_ADMIN"], // the drafted quotation no longer matches the numbers
    ["SUPPLIER_QUOTED", "finalize", "QUOTATION_DRAFTED"],
    ["CBU_PENDING_ADMIN", "finalize", "QUOTATION_DRAFTED"],
    ["QUOTATION_DRAFTED", "finalize", "QUOTATION_DRAFTED"],
  ] as const)("%s + %s → %s", (from, action, to) => {
    expect(nextStatus(from, action).status).toBe(to);
    expect(nextStatus(from, action).note).toBeUndefined();
  });

  it.each(["draft", "finalize"] as const)("a quotation already SENT to the client is never demoted (%s)", (action) => {
    const r = nextStatus("QUOTED_TO_CLIENT", action);
    expect(r.status).toBe("QUOTED_TO_CLIENT");
    expect(r.note).toMatch(/đã gửi/i);
  });
});

describe("finalizeBlockers", () => {
  const params = resolveParams({ logistics: { freightFixedUsd: 100 } });
  const good: CbuLineInput[] = [
    { id: "a", lineNo: 1, qty: 10, materialUsd: 5, totalWeightLb: 20 },
    { id: "b", lineNo: 2, qty: 5, materialUsd: 8, totalWeightLb: 10 },
  ];
  const blockers = (lines: CbuLineInput[], p = params) => finalizeBlockers(lines, calculateCbu(lines, p));

  it("a complete sheet has no blockers", () => {
    expect(blockers(good)).toEqual([]);
  });

  it("blocks an empty sheet", () => {
    expect(blockers([])).toEqual(["Chưa có dòng hàng nào để tính CBU."]);
  });

  it("names the line that misses weight or material cost", () => {
    const r = blockers([good[0], { ...good[1], totalWeightLb: 0 }, { id: "c", lineNo: 3, qty: 1, materialUsd: 0, totalWeightLb: 1 }]);
    expect(r).toEqual(expect.arrayContaining(["Dòng 2: thiếu trọng lượng.", "Dòng 3: chưa có giá gốc (Material Cost)."]));
  });

  it("blocks a line that could not be priced (margin + commission ≥ 100%)", () => {
    const r = blockers(good, resolveParams({ targetMarginPct: 90, commissionPct: 15 }));
    expect(r.some((x) => /chưa có giá bán hợp lệ/.test(x))).toBe(true);
  });

  it("PRICE_INPUT: every line needs a typed price", () => {
    const priced = [{ ...good[0], ddpPriceUsdInput: 12 }, good[1]];
    const r = blockers(priced, resolveParams({ mode: "PRICE_INPUT" }));
    expect(r).toEqual(["Dòng 2: chưa có giá bán hợp lệ."]);
  });
});

describe("cbuConfig", () => {
  it("creates the single implicit scenario when missing or malformed", () => {
    for (const raw of [null, undefined, {}, { schemaVersion: 2 }, "junk"]) {
      const c = normalizeCbuConfig(raw);
      expect(c.schemaVersion).toBe(1);
      expect(c.chosenScenarioId).toBe("default");
      expect(c.scenarios).toHaveLength(1);
    }
  });

  it("keeps an existing v1 config untouched (phase C3 will add scenarios)", () => {
    const cfg = { schemaVersion: 1, chosenScenarioId: "sea", scenarios: [{ id: "air", label: "Air", overrides: {} }, { id: "sea", label: "Sea", overrides: { logistics: { freightFixedUsd: 800 } } }] };
    expect(normalizeCbuConfig(cfg)).toBe(cfg);
  });
});
