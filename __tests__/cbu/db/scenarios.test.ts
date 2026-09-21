/**
 * Scenarios (SPEC §11.3): several logistics options over the same lines — Air / Sea of AC0084.
 * Base params live in the flat RFQ columns (= the FIRST scenario); other scenarios store overrides in cbuConfig.
 * The CHOSEN scenario decides the saved item prices and RFQ totals that the Quotation reads.
 */
import { loadCbuSheet, saveCbuSheet, type CbuDb } from "../../../src/lib/cbu/db/service";
import { saveCbuSchema } from "../../../src/lib/schemas/cbu.schemas";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS, AC0084_SEA, AC0084_TOTALS } from "../fixtures/ac0084";

type Row = Record<string, unknown>;

function makeDb(rfq: Row, items: Row[]) {
  const state = { rfq: { ...rfq }, items: items.map((i) => ({ ...i })) };
  const writes: string[] = [];
  const db = {
    rFQ: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === state.rfq.id ? { ...state.rfq, items: state.items.map((i) => ({ ...i })).sort((a, b) => (a.lineNo as number) - (b.lineNo as number)) } : null,
      update: async ({ data }: { data: Row }) => { writes.push("rfq"); Object.assign(state.rfq, data); return state.rfq; },
    },
    rFQItem: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => { writes.push(`item:${where.id}`); Object.assign(state.items.find((i) => i.id === where.id) as Row, data); return state.items[0]; },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as CbuDb;
  return { db, state, writes };
}

const P = AC0084_PARAMS;
const air = AC0084_LOGISTICS.air;
const sea = AC0084_LOGISTICS.sea;

const airRfq = (extra: Row = {}): Row => ({
  id: "rfq1", rfqCode: "RFQ-1", status: "SUPPLIER_QUOTED", cbuProfile: "DDP_IMPORT", cbuMode: "MARGIN_INPUT", cbuConfig: null, cbuCalculatedAt: null,
  exchangeRate: P.fx, vndRoundingStep: P.vndRoundingStep, lbToKg: P.lbToKg, goodsOrigin: P.goodsOrigin, destinationCountry: P.destinationCountry,
  freightCost: 0, freightFixed: air.freightFixedUsd, freightRatePerKg: air.freightRatePerKg, chargeableWeightKg: air.chargeableKg,
  clearanceCost: air.clearanceUsd, inlandCost: air.inlandUsd, docFee: 0,
  insuredValuePercent: P.insurance.insuredValuePct, insuranceRatePercent: P.insurance.ratePct, minInsuranceUsd: P.insurance.minUsd,
  remittanceRatePercent: P.bank.remitRatePct, bankVatFactor: P.bank.remitVatFactor, minRemittanceFeeUsd: P.bank.minRemitUsd,
  receiveRatePercent: P.bank.receiveRatePct, minReceiveFeeUsd: P.bank.minReceiveUsd, receiveBaseUsd: 0, otherBankFeeUsd: 0,
  percentValueFinanced: P.pctFinanced, interestRatePercent: P.interestPct, financingDays: P.financingDays, daysPerYear: P.daysPerYear,
  targetMarginPercent: P.targetMarginPct, commissionRate: P.commissionPct, citOnCommission: P.citPct,
  totalCostUsd: null, totalRevenueUsd: null, totalRevenueVnd: null, totalMarginUsd: null, actualMarginPct: null, ...extra,
});
const items = (): Row[] => AC0084_AIR.map((r) => ({ id: `l${r.lineNo}`, rfqId: "rfq1", lineNo: r.lineNo, rawPartNumber: r.partNo, rawDescription: null, uom: "PCS", qty: r.qty, supplierUnitPrice: r.materialUsd, netWeightLbs: null, extWeightLbs: r.totalWeightLb, dutyPercent: r.dutyPct, marginPercent: null, marginOverrideUsd: null, ddpPriceUsd: null }));

const SEA_SCENARIOS = [
  { id: "air", label: "Air" },
  { id: "sea", label: "Sea", overrides: { logistics: { freightFixedUsd: sea.freightFixedUsd, freightRatePerKg: sea.freightRatePerKg, chargeableKg: sea.chargeableKg } } },
];

describe("a sheet without a stored config", () => {
  it("has ONE implicit scenario equal to the flat columns (nothing changes for existing RFQs)", async () => {
    const { db } = makeDb(airRfq(), items());
    const s = await loadCbuSheet(db, "rfq1");
    expect(s.scenarios).toHaveLength(1);
    expect(s.chosenScenarioId).toBe(s.scenarios[0].id);
    expect(s.scenarios[0].result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(s.result).toEqual(s.scenarios[0].result);
  });
});

describe("Air + Sea", () => {
  it("each scenario reproduces its Excel block; the compare figure matches the workbook (Air − Sea = 112,000,000 ₫)", async () => {
    const { db } = makeDb(airRfq(), items());
    const out = await saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS }, "draft");
    const [a, s] = out.sheet.scenarios;

    expect(a.id).toBe("air");
    expect(a.result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(a.result.pools.logisticsPoolUsd).toBeCloseTo(air.expectedPoolUsd, 9);
    expect(s.result.totals.revenueVnd).toBe(AC0084_TOTALS.sea.totalRevenueVnd);
    expect(s.result.pools.logisticsPoolUsd).toBeCloseTo(sea.expectedPoolUsd, 9);
    s.result.lines.forEach((l, i) => expect(l.ddpPriceUsd).toBeCloseTo(AC0084_SEA[i].expected.ddpPriceUsd, 9));
    expect(a.result.totals.revenueVnd - s.result.totals.revenueVnd).toBe(112_000_000);
    expect(a.result.checks.concat(s.result.checks).every((c) => c.ok)).toBe(true);
  });

  it("the second scenario stores only ITS logistics; the flat columns keep the first (base) scenario", async () => {
    const { db, state } = makeDb(airRfq(), items());
    await saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS }, "draft");
    expect(state.rfq.freightFixed).toBe(air.freightFixedUsd);
    expect(state.rfq.freightRatePerKg).toBe(air.freightRatePerKg);
    const cfg = state.rfq.cbuConfig as { chosenScenarioId: string; scenarios: { id: string; overrides: { logistics?: Record<string, number> } }[] };
    expect(cfg.scenarios.map((x) => x.id)).toEqual(["air", "sea"]);
    expect(cfg.scenarios[0].overrides).toEqual({});
    expect(cfg.scenarios[1].overrides.logistics).toMatchObject({ freightFixedUsd: 800, freightRatePerKg: 0, chargeableKg: 0 });
  });

  it("shared fields (target margin, per-line duty) apply to every scenario; the sea scenario inherits the base clearance/inland", async () => {
    const { db } = makeDb(airRfq(), items());
    const out = await saveCbuSheet(db, "rfq1", { params: { targetMarginPct: 30 }, items: [{ id: "l1", dutyPct: 10 }], scenarios: SEA_SCENARIOS }, "draft");
    for (const sc of out.sheet.scenarios) {
      expect(sc.result.lines[0].dutyUsd).toBeGreaterThan(0);
      expect(sc.result.lines[1].marginPct).toBeGreaterThanOrEqual(30 - 1e-9);
    }
    expect(out.sheet.scenarios[1].params.logistics).toMatchObject({ clearanceUsd: air.clearanceUsd, inlandUsd: air.inlandUsd, freightFixedUsd: 800 });
  });

  it("the CHOSEN scenario decides the saved item prices and RFQ totals (what the Quotation reads)", async () => {
    const { db, state } = makeDb(airRfq(), items());
    await saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS, chosenScenarioId: "sea" }, "draft");
    expect(state.rfq.totalRevenueVnd).toBe(BigInt(AC0084_TOTALS.sea.totalRevenueVnd));
    expect((state.items[0] as Row).ddpPriceUsd).toBeCloseTo(AC0084_SEA[0].expected.ddpPriceUsd, 9); // 6.41, not the Air 7.10
    expect((state.rfq.cbuConfig as { chosenScenarioId: string }).chosenScenarioId).toBe("sea");

    await saveCbuSheet(db, "rfq1", { chosenScenarioId: "air" }, "draft"); // switch back, scenarios kept
    expect(state.rfq.totalRevenueVnd).toBe(BigInt(AC0084_TOTALS.air.totalRevenueVnd));
    expect((state.items[0] as Row).ddpPriceUsd).toBeCloseTo(7.1, 9);
    expect((state.rfq.cbuConfig as { scenarios: unknown[] }).scenarios).toHaveLength(2);
  });

  it("save → reload returns exactly the same sheet, scenarios included", async () => {
    const { db } = makeDb(airRfq(), items());
    const saved = await saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS, chosenScenarioId: "sea" }, "draft");
    const again = await loadCbuSheet(db, "rfq1");
    expect(again.scenarios).toEqual(saved.sheet.scenarios);
    expect(again.chosenScenarioId).toBe("sea");
    expect(again.result).toEqual(again.scenarios[1].result);
  });

  it("removing a scenario is a save without it; a chosen id that no longer exists is rejected", async () => {
    const { db } = makeDb(airRfq(), items());
    await saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS }, "draft");
    const one = await saveCbuSheet(db, "rfq1", { scenarios: [{ id: "air", label: "Air" }] }, "draft");
    expect(one.sheet.scenarios).toHaveLength(1);
    await expect(saveCbuSheet(db, "rfq1", { chosenScenarioId: "sea" }, "draft")).rejects.toMatchObject({ status: 400 });
  });

  it("PRICE_INPUT: prices are per scenario and persisted per scenario", async () => {
    const { db, state } = makeDb(airRfq(), items());
    const airPrices = Object.fromEntries(AC0084_AIR.map((r) => [`l${r.lineNo}`, r.expected.ddpPriceUsd]));
    const seaPrices = Object.fromEntries(AC0084_SEA.map((r) => [`l${r.lineNo}`, r.expected.ddpPriceUsd]));
    const out = await saveCbuSheet(db, "rfq1", {
      mode: "PRICE_INPUT",
      scenarios: [{ ...SEA_SCENARIOS[0], prices: airPrices }, { ...SEA_SCENARIOS[1], prices: seaPrices }],
      chosenScenarioId: "air",
    }, "draft");

    const [a, s] = out.sheet.scenarios;
    expect(a.result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(s.result.totals.revenueVnd).toBe(AC0084_TOTALS.sea.totalRevenueVnd);
    expect(s.prices["l1"]).toBe(AC0084_SEA[0].expected.ddpPriceUsd);
    expect(Math.abs(a.result.totals.marginPct - AC0084_TOTALS.air.marginPct)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(s.result.totals.marginPct - AC0084_TOTALS.sea.marginPct)).toBeLessThanOrEqual(0.0051);
    // the item column holds the CHOSEN scenario's price only
    expect((state.items[0] as Row).ddpPriceUsd).toBe(AC0084_AIR[0].expected.ddpPriceUsd);
  });

  it("finalize gates the CHOSEN scenario only", async () => {
    const { db } = makeDb(airRfq({ status: "CBU_PENDING_ADMIN", inlandCost: 100 }), items());
    // sea scenario is complete; air is chosen and complete → ok even though a scenario has no prices in MARGIN mode
    await expect(saveCbuSheet(db, "rfq1", { scenarios: SEA_SCENARIOS, chosenScenarioId: "sea" }, "finalize")).resolves.toMatchObject({ statusChange: { to: "QUOTATION_DRAFTED" } });
    // PRICE mode: chosen scenario has no prices → blocked with reasons for that scenario's lines
    const err = await saveCbuSheet(db, "rfq1", { mode: "PRICE_INPUT", scenarios: SEA_SCENARIOS, chosenScenarioId: "sea" }, "finalize").catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.details.length).toBe(16);
  });

  it("legacy clients (items[].ddpPriceUsdInput, no scenarios) still work and write the first scenario's prices", async () => {
    const { db } = makeDb(airRfq(), items());
    const out = await saveCbuSheet(db, "rfq1", { mode: "PRICE_INPUT", items: AC0084_AIR.map((r) => ({ id: `l${r.lineNo}`, ddpPriceUsdInput: r.expected.ddpPriceUsd })) }, "draft");
    expect(out.sheet.scenarios).toHaveLength(1);
    expect(out.sheet.scenarios[0].result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(out.sheet.scenarios[0].prices["l1"]).toBe(7.1);
  });
});

describe("saveCbuSchema — scenarios", () => {
  const ok = (b: unknown) => saveCbuSchema.safeParse(b).success;
  it("accepts a normal Air/Sea body", () => {
    expect(ok({ scenarios: SEA_SCENARIOS, chosenScenarioId: "sea" })).toBe(true);
  });
  it.each([
    ["duplicate scenario ids", { scenarios: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }],
    ["more than 4 scenarios", { scenarios: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id })) }],
    ["empty list", { scenarios: [] }],
    ["bad id", { scenarios: [{ id: "has space", label: "A" }] }],
    ["blank label", { scenarios: [{ id: "a", label: "  " }] }],
    ["negative freight in an override", { scenarios: [{ id: "a", label: "A", overrides: { logistics: { freightFixedUsd: -1 } } }] }],
    ["negative price", { scenarios: [{ id: "a", label: "A", prices: { l1: -3 } }] }],
    ["chosen id not among the given scenarios", { scenarios: [{ id: "a", label: "A" }], chosenScenarioId: "zzz" }],
  ])("rejects %s", (_n, body) => {
    expect(ok(body)).toBe(false);
  });
  it("overrides other than logistics are stripped (only logistics may vary per scenario for now)", () => {
    const p = saveCbuSchema.parse({ scenarios: [{ id: "a", label: "A", overrides: { logistics: { freightFixedUsd: 1 }, targetMarginPct: 90 } }] });
    expect(JSON.stringify(p)).not.toContain("targetMarginPct");
  });
});
