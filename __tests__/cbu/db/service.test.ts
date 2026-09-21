/**
 * CBU service: load → server-side recalculation → save → reload, against an in-memory fake of Prisma.
 * Data = the AC0084 AIR block (SPEC §11.10), so the whole DB → engine → DB path is held to the Excel numbers.
 */
import { CbuHttpError } from "../../../src/lib/cbu/db/errors";
import { legacyBodyToSaveInput } from "../../../src/lib/cbu/db/legacy-body";
import { loadCbuSheet, saveCbuSheet, type CbuDb } from "../../../src/lib/cbu/db/service";
import { legacyCalculateCbuSchema, saveCbuSchema } from "../../../src/lib/schemas/cbu.schemas";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS, AC0084_TOTALS } from "../fixtures/ac0084";

type Row = Record<string, unknown>;

/** Enough of Prisma for the service: findUnique(+items), rFQ.update, rFQItem.update, $transaction. */
function makeDb(rfq: Row, items: Row[]) {
  const state = { rfq: { ...rfq }, items: items.map((i) => ({ ...i })) };
  const writes: string[] = [];
  const db = {
    rFQ: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === state.rfq.id
          ? { ...state.rfq, items: state.items.map((i) => ({ ...i })).sort((a, b) => (a.lineNo as number) - (b.lineNo as number)) }
          : null,
      update: async ({ data }: { data: Row }) => {
        writes.push("rfq");
        Object.assign(state.rfq, data);
        return state.rfq;
      },
    },
    rFQItem: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        writes.push(`item:${where.id}`);
        Object.assign(state.items.find((i) => i.id === where.id) as Row, data);
        return state.items[0];
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as CbuDb;
  return { db, state, writes };
}

const air = AC0084_LOGISTICS.air;
const P = AC0084_PARAMS;

function airRfq(overrides: Row = {}): Row {
  return {
    id: "rfq1",
    rfqCode: "RFQ-1",
    status: "SUPPLIER_QUOTED",
    incoTerm: "DDP Vung Tau",
    paymentTerm: "30/70",
    supplierName: "Keystone",
    cbuProfile: "DDP_IMPORT",
    cbuMode: "MARGIN_INPUT",
    cbuConfig: null,
    cbuCalculatedAt: null,
    exchangeRate: P.fx,
    vndRoundingStep: P.vndRoundingStep,
    lbToKg: P.lbToKg,
    goodsOrigin: P.goodsOrigin,
    destinationCountry: P.destinationCountry,
    freightCost: 0,
    freightFixed: air.freightFixedUsd,
    freightRatePerKg: air.freightRatePerKg,
    chargeableWeightKg: air.chargeableKg,
    clearanceCost: air.clearanceUsd,
    inlandCost: air.inlandUsd,
    docFee: 0,
    insuredValuePercent: P.insurance.insuredValuePct,
    insuranceRatePercent: P.insurance.ratePct,
    minInsuranceUsd: P.insurance.minUsd,
    remittanceRatePercent: P.bank.remitRatePct,
    bankVatFactor: P.bank.remitVatFactor,
    minRemittanceFeeUsd: P.bank.minRemitUsd,
    receiveRatePercent: P.bank.receiveRatePct,
    minReceiveFeeUsd: P.bank.minReceiveUsd,
    receiveBaseUsd: 0,
    otherBankFeeUsd: 0,
    percentValueFinanced: P.pctFinanced,
    interestRatePercent: P.interestPct,
    financingDays: P.financingDays,
    daysPerYear: P.daysPerYear,
    targetMarginPercent: P.targetMarginPct,
    commissionRate: P.commissionPct,
    citOnCommission: P.citPct,
    totalCostUsd: null,
    totalRevenueUsd: null,
    totalRevenueVnd: null,
    totalMarginUsd: null,
    actualMarginPct: null,
    ...overrides,
  };
}

function airItems(): Row[] {
  return AC0084_AIR.map((r) => ({
    id: `l${r.lineNo}`,
    rfqId: "rfq1",
    lineNo: r.lineNo,
    rawPartNumber: r.partNo,
    rawDescription: null,
    uom: "PCS",
    qty: r.qty,
    supplierUnitPrice: r.materialUsd,
    netWeightLbs: null,
    extWeightLbs: r.totalWeightLb, // Excel col F — TOTAL weight of the line
    dutyPercent: r.dutyPct,
    marginPercent: null,
    marginOverrideUsd: null,
    ddpPriceUsd: null,
  }));
}

const lineById = (state: { items: Row[] }, id: string) => state.items.find((i) => i.id === id) as Row;

describe("loadCbuSheet", () => {
  it("recomputes from stored inputs and matches Excel line by line and in total", async () => {
    const { db } = makeDb(airRfq(), airItems());
    const { result, items } = await loadCbuSheet(db, "rfq1");

    expect(items).toHaveLength(16);
    result.lines.forEach((l, i) => {
      expect(l.ddpPriceUsd).toBeCloseTo(AC0084_AIR[i].expected.ddpPriceUsd, 9);
      expect(l.ddpPriceVnd).toBe(AC0084_AIR[i].expected.ddpPriceVnd);
    });
    expect(result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("404 for an unknown RFQ", async () => {
    const { db } = makeDb(airRfq(), airItems());
    await expect(loadCbuSheet(db, "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("is JSON-serialisable (no BigInt leaks) even when totals were saved as BigInt", async () => {
    const { db } = makeDb(airRfq({ totalRevenueVnd: BigInt(890800000) }), airItems());
    const sheet = await loadCbuSheet(db, "rfq1");
    expect(sheet.saved.totalRevenueVnd).toBe(890800000);
    expect(() => JSON.stringify(sheet)).not.toThrow();
  });
});

describe("saveCbuSheet — draft", () => {
  const NOW = new Date("2026-09-21T10:00:00.000Z");

  it("persists the SERVER-computed Excel numbers on items and on the RFQ", async () => {
    const { db, state } = makeDb(airRfq(), airItems());
    const out = await saveCbuSheet(db, "rfq1", {}, "draft", NOW);

    const l1 = lineById(state, "l1");
    expect(l1.ddpPriceUsd).toBeCloseTo(7.1, 9);
    expect(l1.ddpPriceVnd).toBe(BigInt(190000));
    expect(Math.abs((l1.unitCostUsd as number) - 5.3218)).toBeLessThan(6e-5);
    expect(l1.netWeightLbs).toBeCloseTo(0.38, 9); // 121.6 lb ÷ 320 — derived from the canonical total
    expect(l1.marginPercent).toBeNull();
    expect(l1.commissionPercent).toBe(3);

    // apportioned logistics + insurance across all lines re-adds to the 4,015 pool (no double counting)
    const pool = state.items.reduce((s, i) => s + ((i.apportionedLogistics as number) + (i.apportionedInsurance as number)), 0);
    expect(pool).toBeCloseTo(air.expectedPoolUsd, 6);

    expect(state.rfq.totalRevenueVnd).toBe(BigInt(AC0084_TOTALS.air.totalRevenueVnd));
    expect(state.rfq.totalRevenueUsd as number).toBeCloseTo(AC0084_TOTALS.air.ddpPriceUsd, 2);
    expect(state.rfq.totalCostUsd as number).toBeCloseTo(AC0084_TOTALS.air.unitCostUsd, 2);
    expect(state.rfq.status).toBe("CBU_PENDING_ADMIN");
    expect(state.rfq.cbuCalculatedAt).toEqual(NOW);
    expect(state.rfq.cbuProfile).toBe("DDP_IMPORT");
    expect((state.rfq.cbuConfig as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(out.statusChange).toEqual({ from: "SUPPLIER_QUOTED", to: "CBU_PENDING_ADMIN" });
  });

  it("save → reload returns EXACTLY the same sheet (G2), including a null margin override", async () => {
    const { db } = makeDb(airRfq(), airItems());
    const before = await loadCbuSheet(db, "rfq1");
    const saved = await saveCbuSheet(db, "rfq1", {}, "draft");
    const after = await loadCbuSheet(db, "rfq1");

    expect(after.result).toEqual(before.result);
    expect(after.items.map((i) => i.marginPctOverride)).toEqual(Array(16).fill(null)); // not 0, not 25
    expect(saved.sheet.result).toEqual(after.result);
    expect(saved.sheet.saved.calculatedAt).not.toBeNull();
  });

  it("persists parameters that used to be lost on reload (mode, target margin, commission, CIT — SPEC F5)", async () => {
    const { db, state } = makeDb(airRfq(), airItems());
    await saveCbuSheet(db, "rfq1", { params: { targetMarginPct: 30, commissionPct: 5, citPct: 10, logistics: { clearanceUsd: 200 } } }, "draft");

    expect(state.rfq.targetMarginPercent).toBe(30);
    expect(state.rfq.commissionRate).toBe(5);
    expect(state.rfq.citOnCommission).toBe(10);
    expect(state.rfq.clearanceCost).toBe(200);
    expect(state.rfq.inlandCost).toBe(air.inlandUsd); // untouched fields keep their stored value

    const reloaded = await loadCbuSheet(db, "rfq1");
    expect(reloaded.params.targetMarginPct).toBe(30);
    expect(reloaded.params.commissionPct).toBe(5);
    expect(reloaded.params.logistics.clearanceUsd).toBe(200);
    expect(reloaded.result.lines[0].marginPct).toBeGreaterThanOrEqual(30 - 1e-9);
  });

  it("persists line edits (material, weight, duty) and margin overrides; null clears an override", async () => {
    const { db, state } = makeDb(airRfq(), airItems());
    await saveCbuSheet(db, "rfq1", { items: [{ id: "l1", materialUsd: 5, totalWeightLb: 150, dutyPct: 8, marginPctOverride: 40, marginUsdOverride: 2 }] }, "draft");
    let l1 = lineById(state, "l1");
    expect([l1.supplierUnitPrice, l1.extWeightLbs, l1.dutyPercent, l1.marginPercent, l1.marginOverrideUsd]).toEqual([5, 150, 8, 40, 2]);
    expect((await loadCbuSheet(db, "rfq1")).items[0].marginUsdOverride).toBe(2);

    await saveCbuSheet(db, "rfq1", { items: [{ id: "l1", materialUsd: 4.37, totalWeightLb: 121.6, dutyPct: 0, marginPctOverride: null, marginUsdOverride: null }] }, "draft");
    l1 = lineById(state, "l1");
    expect([l1.marginPercent, l1.marginOverrideUsd]).toEqual([null, null]);
    expect(l1.ddpPriceUsd).toBeCloseTo(7.1, 9); // back to the Excel price
  });

  it("rejects edits for a line that is not on this RFQ and writes NOTHING", async () => {
    const { db, writes } = makeDb(airRfq(), airItems());
    await expect(saveCbuSheet(db, "rfq1", { items: [{ id: "ghost", dutyPct: 1 }] }, "draft")).rejects.toMatchObject({ status: 400 });
    expect(writes).toEqual([]);
  });

  it("404 for an unknown RFQ", async () => {
    const { db } = makeDb(airRfq(), airItems());
    await expect(saveCbuSheet(db, "nope", {}, "draft")).rejects.toBeInstanceOf(CbuHttpError);
  });

  it("PRICE_INPUT: stores typed prices and derives the margin; reloading shows the same prices again", async () => {
    const { db, state } = makeDb(airRfq(), airItems());
    const items = AC0084_AIR.map((r) => ({ id: `l${r.lineNo}`, ddpPriceUsdInput: r.expected.ddpPriceUsd }));
    const out = await saveCbuSheet(db, "rfq1", { mode: "PRICE_INPUT", items }, "draft");

    expect(state.rfq.cbuMode).toBe("PRICE_INPUT");
    expect(out.sheet.result.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(Math.abs(out.sheet.result.totals.marginPct - AC0084_TOTALS.air.marginPct)).toBeLessThanOrEqual(0.0051);
    expect(out.sheet.items.map((i) => i.ddpPriceUsdInput)).toEqual(AC0084_AIR.map((r) => r.expected.ddpPriceUsd));
  });

  it("a QUOTATION_DRAFTED RFQ falls back to CBU_PENDING_ADMIN; a quotation SENT to the client is never demoted", async () => {
    const drafted = makeDb(airRfq({ status: "QUOTATION_DRAFTED" }), airItems());
    expect((await saveCbuSheet(drafted.db, "rfq1", {}, "draft")).statusChange.to).toBe("CBU_PENDING_ADMIN");

    const sent = makeDb(airRfq({ status: "QUOTED_TO_CLIENT" }), airItems());
    const out = await saveCbuSheet(sent.db, "rfq1", {}, "draft");
    expect(sent.state.rfq.status).toBe("QUOTED_TO_CLIENT");
    expect(out.notes.join(" ")).toMatch(/đã gửi/i);
  });
});

describe("saveCbuSheet — finalize", () => {
  it("succeeds on a complete sheet → QUOTATION_DRAFTED", async () => {
    const { db, state } = makeDb(airRfq({ status: "CBU_PENDING_ADMIN" }), airItems());
    const out = await saveCbuSheet(db, "rfq1", {}, "finalize");
    expect(state.rfq.status).toBe("QUOTATION_DRAFTED");
    expect(out.statusChange).toEqual({ from: "CBU_PENDING_ADMIN", to: "QUOTATION_DRAFTED" });
  });

  it("is BLOCKED (422 + reasons) when a line has no weight, and persists nothing", async () => {
    const { db, state, writes } = makeDb(airRfq({ status: "CBU_PENDING_ADMIN" }), airItems());
    const err = await saveCbuSheet(db, "rfq1", { items: [{ id: "l3", totalWeightLb: 0 }] }, "finalize").catch((e) => e);

    expect(err).toBeInstanceOf(CbuHttpError);
    expect(err.status).toBe(422);
    expect(err.details).toContain("Dòng 3: thiếu trọng lượng.");
    expect(writes).toEqual([]);
    expect(state.rfq.status).toBe("CBU_PENDING_ADMIN");
    expect(lineById(state, "l3").extWeightLbs).toBe(AC0084_AIR[2].totalWeightLb);
  });

  it("is BLOCKED in PRICE_INPUT while a price is missing", async () => {
    const { db } = makeDb(airRfq(), airItems());
    const err = await saveCbuSheet(db, "rfq1", { mode: "PRICE_INPUT" }, "finalize").catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.details.length).toBe(16);
  });

  it("does not demote a quotation already sent to the client", async () => {
    const { db, state } = makeDb(airRfq({ status: "QUOTED_TO_CLIENT" }), airItems());
    await saveCbuSheet(db, "rfq1", {}, "finalize");
    expect(state.rfq.status).toBe("QUOTED_TO_CLIENT");
  });
});

describe("the server ignores numbers computed by the client (SPEC §11.6-5)", () => {
  it("v2 schema strips totals and per-line results before they can reach the service", () => {
    const parsed = saveCbuSchema.parse({
      totalRevenueUsd: 1,
      totalRevenueVnd: 1,
      params: { targetMarginPct: 25, totalCostUsd: 1 },
      items: [{ id: "l1", dutyPct: 0, ddpPriceUsd: 1, ddpPriceVnd: 1, unitCostUsd: 1, apportionedLogistics: 1 }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/totalRevenue|totalCost|ddpPriceVnd|unitCostUsd|apportioned|"ddpPriceUsd"/);
  });

  it("legacy page body with TAMPERED totals and prices still saves the Excel numbers", async () => {
    const { db, state } = makeDb(airRfq(), airItems());
    const body = legacyCalculateCbuSchema.parse({
      finalize: false,
      cbuMode: "MARGIN_INPUT",
      targetMarginPercent: 25,
      commissionRate: 3,
      citOnCommission: 20,
      // forged results the old page would have computed in the browser:
      totalCostUsd: 1,
      totalRevenueUsd: 999999,
      totalRevenueVnd: 1,
      totalMarginUsd: 999999,
      actualMarginPct: 99,
      items: AC0084_AIR.map((r) => ({
        id: `l${r.lineNo}`,
        supplierUnitPrice: r.materialUsd,
        netWeightLbs: r.totalWeightLb / r.qty, // the legacy page sends the weight of ONE unit
        dutyPercent: 0,
        marginPercent: null,
        marginOverrideUsd: 0,
        targetDdpPriceUsd: 0,
        ddpPriceUsd: 0.01, // forged
        totalRevenueUsd: 1, // forged
      })),
    });
    const input = saveCbuSchema.parse(legacyBodyToSaveInput(body));
    await saveCbuSheet(db, "rfq1", input, "draft");

    expect(state.rfq.totalRevenueVnd).toBe(BigInt(AC0084_TOTALS.air.totalRevenueVnd));
    expect(state.rfq.totalRevenueUsd as number).toBeCloseTo(AC0084_TOTALS.air.ddpPriceUsd, 2);
    expect(lineById(state, "l1").ddpPriceUsd).toBeCloseTo(7.1, 9);
    expect(lineById(state, "l1").marginPercent).toBeNull();
    expect(lineById(state, "l1").extWeightLbs).toBeCloseTo(121.6, 9); // per-unit × STORED qty
  });
});
