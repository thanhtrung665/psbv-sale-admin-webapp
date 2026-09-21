/**
 * Baker Hughes (FCA_DAP) end to end WITHOUT a database: RFQ rows → service → sheet → draft → engine → save input →
 * service → reload. Payment terms are the scenarios; the quote basis (FCA / DAP) decides what the Quotation reads.
 * Numbers: fixtures/ac0481.ts (from the Baker markdown workbooks).
 */
import { calculateCbu } from "../../src/lib/cbu";
import { loadCbuSheet, saveCbuSheet } from "../../src/lib/cbu/db/service";
import {
  addScenario,
  draftToEngine,
  draftToSaveInput,
  editableColumns,
  setItemValue,
  setScenarioField,
  sheetToDraft,
  switchProfile,
  dapPriceErrorKey,
  allErrors,
  scenarioFieldsFor,
  sharedFieldsFor,
} from "../../src/lib/cbu/ui/draft";
import { saveCbuSchema } from "../../src/lib/schemas/cbu.schemas";
import { AC0481_EXPECTED as E, AC0481_SCENARIOS as S } from "./fixtures/ac0481";

import { bakerItems, bakerRfq, makeDb, type Row } from "./fixtures/baker-db";

const TERMS = [
  { id: "pwo", label: "Payment with Order" },
  { id: "net60", label: "Net 60 Days", overrides: { pctFinanced: 100, financingDays: 45, logistics: { freightAllInUsd: S.net60.freightQuotedUsd } } },
];

describe("service · Baker Hughes", () => {
  it("loads an FCA_DAP RFQ with the Baker defaults filled in and prices it like the workbook", async () => {
    const { db } = makeDb(bakerRfq(), bakerItems());
    const s = await loadCbuSheet(db, "b1");
    expect(s.profile).toBe("FCA_DAP");
    expect(s.quoteBasis).toBe("FCA"); // Incoterm "FCA"
    expect(s.result.profile).toBe("FCA_DAP");
    expect(s.result.lines[0].fca!.priceUsd).toBe(131);
    expect(s.result.dap!.totalUsd).toBe(E.paymentWithOrder.totalUsd);
    expect(s.result.checks.every((c) => c.ok)).toBe(true);
  });

  it("the quote basis defaults to DAP when the RFQ's Incoterm says DAP / DDP", async () => {
    const { db } = makeDb(bakerRfq({ incoTerm: "DAP Kemaman" }), bakerItems());
    expect((await loadCbuSheet(db, "b1")).quoteBasis).toBe("DAP");
  });

  it("two payment terms as scenarios: Payment with Order 131 / 5,730 and Net 60 133 / 5,090 (workbook)", async () => {
    const { db } = makeDb(bakerRfq(), bakerItems());
    const out = await saveCbuSheet(db, "b1", { scenarios: TERMS }, "draft");
    const [pwo, net60] = out.sheet.scenarios;

    expect(pwo.result.lines[0].dap!.priceUsd).toBe(131);
    expect(pwo.result.dap!.totalUsd).toBe(E.paymentWithOrder.totalUsd);
    expect(pwo.result.dap!.freightMismatchUsd).toBe(0);

    expect(net60.params.pctFinanced).toBe(100);
    expect(net60.params.financingDays).toBe(45);
    expect(net60.result.lines[0].fca!.priceUsd).toBe(131); // FCA carries no credit interest
    expect(net60.result.lines[0].dap!.priceUsd).toBe(133);
    expect(net60.result.dap!.goodsRevenueUsd).toBe(3990);
    expect(net60.result.dap!.totalUsd).toBe(E.net60.totalUsd);
    expect(net60.result.dap!.freightMismatchUsd).toBeCloseTo(700, 9);
    expect(net60.result.warnings.some((w) => /cước/i.test(w))).toBe(true);
  });

  it("the base scenario keeps its terms in the flat columns; only the other term is stored as overrides", async () => {
    const { db, state } = makeDb(bakerRfq(), bakerItems());
    await saveCbuSheet(db, "b1", { scenarios: TERMS }, "draft");
    expect(state.rfq.percentValueFinanced).toBe(0);
    expect(state.rfq.financingDays).toBe(0);
    expect(state.rfq.freightCost).toBe(1800);
    expect(state.rfq.cbuProfile).toBe("FCA_DAP");
    const cfg = state.rfq.cbuConfig as { scenarios: { id: string; overrides: Row }[] };
    expect(cfg.scenarios[0].overrides).toEqual({});
    expect(cfg.scenarios[1].overrides).toMatchObject({ pctFinanced: 100, financingDays: 45, logistics: { freightAllInUsd: 1100 } });
  });

  it("FCA basis: the lines and totals the Quotation reads are the FCA block (131 · 3,930)", async () => {
    const { db, state } = makeDb(bakerRfq(), bakerItems());
    await saveCbuSheet(db, "b1", { scenarios: TERMS, chosenScenarioId: "net60", quoteBasis: "FCA" }, "draft");
    expect((state.items[0] as Row).ddpPriceUsd).toBe(131);
    expect(state.rfq.totalRevenueUsd).toBe(3930);
    expect((state.rfq.cbuConfig as { quoteBasis: string }).quoteBasis).toBe("FCA");
  });

  it("DAP basis + Net 60: item price 133 and the RFQ total = goods 3,990 + the lump-sum freight 1,100 = 5,090", async () => {
    const { db, state } = makeDb(bakerRfq(), bakerItems());
    await saveCbuSheet(db, "b1", { scenarios: TERMS, chosenScenarioId: "net60", quoteBasis: "DAP" }, "draft");
    const item = state.items[0] as Row;
    expect(item.ddpPriceUsd).toBe(133);
    expect(item.unitCostUsd as number).toBeCloseTo(E.net60.dap.unitCostUsd, 4);
    expect(state.rfq.totalRevenueUsd).toBe(E.net60.totalUsd);
    // VND: 30 × ⌈133 × 25,500 / 10,000⌉ × 10,000 = 102,000,000 for the goods, plus 1,100 × 25,500 = 28,050,000 for the freight
    expect(state.rfq.totalRevenueVnd).toBe(BigInt(130_050_000));
  });

  it("PRICE_INPUT: FCA and DAP prices are typed per scenario and persisted per scenario", async () => {
    const { db, state } = makeDb(bakerRfq(), bakerItems());
    const out = await saveCbuSheet(db, "b1", {
      mode: "PRICE_INPUT",
      scenarios: [
        { ...TERMS[0], prices: { l1: 131 }, dapPrices: { l1: 131 } },
        { ...TERMS[1], prices: { l1: 131 }, dapPrices: { l1: 133 } },
      ],
    }, "draft");
    const [pwo, net60] = out.sheet.scenarios;
    expect(pwo.result.dap!.totalUsd).toBe(5730);
    expect(net60.result.dap!.totalUsd).toBe(5090);
    expect(net60.dapPrices["l1"]).toBe(133);
    expect(net60.result.lines[0].dap!.marginPct).toBeCloseTo(17.06, 1);
    const cfg = state.rfq.cbuConfig as { scenarios: { prices: Row; dapPrices: Row }[] };
    expect(cfg.scenarios[1].dapPrices).toEqual({ l1: 133 });
  });

  it("finalize needs no weight, but in PRICE_INPUT it needs both prices of the chosen scenario", async () => {
    const noWeight = bakerItems().map((i) => ({ ...i, extWeightLbs: null }));
    const a = makeDb(bakerRfq({ status: "CBU_PENDING_ADMIN" }), noWeight);
    await expect(saveCbuSheet(a.db, "b1", { scenarios: TERMS }, "finalize")).resolves.toMatchObject({ statusChange: { to: "QUOTATION_DRAFTED" } });

    const b = makeDb(bakerRfq({ status: "CBU_PENDING_ADMIN" }), bakerItems());
    const err = await saveCbuSheet(b.db, "b1", { mode: "PRICE_INPUT", scenarios: [{ ...TERMS[0], prices: { l1: 131 } }] }, "finalize").catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.details.join(" ")).toMatch(/DAP/);
    expect(err.details.join(" ")).not.toMatch(/FCA hợp lệ/);
  });

  it("a DDP RFQ is untouched: the profile column, not the data, selects the model", async () => {
    const { db } = makeDb(bakerRfq({ cbuProfile: "DDP_IMPORT" }), bakerItems());
    const s = await loadCbuSheet(db, "b1");
    expect(s.profile).toBe("DDP_IMPORT");
    expect(s.result.profile).toBe("DDP_IMPORT");
    expect(s.result.lines[0].fca).toBeUndefined();
  });

  it("switching an RFQ to FCA_DAP through the API persists the profile", async () => {
    const { db, state } = makeDb(bakerRfq({ cbuProfile: "DDP_IMPORT" }), bakerItems());
    const out = await saveCbuSheet(db, "b1", { profile: "FCA_DAP" }, "draft");
    expect(out.sheet.profile).toBe("FCA_DAP");
    expect(state.rfq.cbuProfile).toBe("FCA_DAP");
  });
});

describe("draft ⇄ server · Baker Hughes", () => {
  async function sheet(extra: Row = {}) {
    const { db, state } = makeDb(bakerRfq(extra), bakerItems());
    return { db, state, sheet: await loadCbuSheet(db, "b1") };
  }

  it("sheetToDraft puts the payment terms in the SCENARIO and the bank tariff in the shared params", async () => {
    const { sheet: s } = await sheet();
    const d = sheetToDraft(s);
    expect(d.profile).toBe("FCA_DAP");
    expect(Object.keys(d.scenarios[0].fields).sort()).toEqual(scenarioFieldsFor("FCA_DAP").map((f) => f.path).sort());
    expect(d.scenarios[0].fields["pctFinanced"]).toBe("0");
    expect(d.scenarios[0].fields["logistics.freightAllInUsd"]).toBe("1800");
    expect(d.params["bank.receiveBaseUsd"]).toBe("3930");
    expect(d.params).not.toHaveProperty("commissionPct"); // not part of this model
    expect(sharedFieldsFor("FCA_DAP").some((f) => f.path === "commissionPct")).toBe(false);
  });

  it("the browser computes exactly what the server computed (same engine, same inputs)", async () => {
    const { db } = makeDb(bakerRfq(), bakerItems());
    const saved = await saveCbuSheet(db, "b1", { scenarios: TERMS, chosenScenarioId: "net60", quoteBasis: "DAP" }, "draft");
    const d = sheetToDraft(saved.sheet);
    for (const sc of saved.sheet.scenarios) {
      const e = draftToEngine(d, sc.id);
      expect(e.errors).toEqual({});
      expect(calculateCbu(e.lines, e.params)).toEqual(sc.result);
    }
  });

  it("draft → save input → server → reload is the identity", async () => {
    const { db } = makeDb(bakerRfq(), bakerItems());
    const first = sheetToDraft(await loadCbuSheet(db, "b1"));
    let d = addScenario(first, first.scenarios[0].id)!.draft;
    d = setScenarioField(d, d.scenarios[1].id, "pctFinanced", "100");
    d = setScenarioField(d, d.scenarios[1].id, "financingDays", "45");
    d = setScenarioField(d, d.scenarios[1].id, "logistics.freightAllInUsd", "1100");

    const input = draftToSaveInput(d);
    expect(saveCbuSchema.safeParse(input).success).toBe(true);
    expect(input.profile).toBe("FCA_DAP");
    expect(input.scenarios?.[1].overrides).toMatchObject({ pctFinanced: 100, financingDays: 45, logistics: { freightAllInUsd: 1100 } });
    expect(input.scenarios?.[0]).not.toHaveProperty("overrides");

    const saved = await saveCbuSheet(db, "b1", saveCbuSchema.parse(input), "draft");
    const reloaded = await loadCbuSheet(db, "b1");
    expect(reloaded.scenarios).toEqual(saved.sheet.scenarios);
    expect(reloaded.scenarios[1].result.dap!.totalUsd).toBe(5090);
    expect(sheetToDraft(reloaded)).toEqual(sheetToDraft(saved.sheet));
  });

  it("switchProfile: DDP → FCA_DAP starts with the workbook's two payment terms and the Baker defaults", async () => {
    const { db } = makeDb(bakerRfq({ cbuProfile: "DDP_IMPORT", targetMarginPercent: 25, commissionRate: 3 }), bakerItems());
    const ddp = sheetToDraft(await loadCbuSheet(db, "b1"));
    const baker = switchProfile(ddp, "FCA_DAP");
    expect(baker.profile).toBe("FCA_DAP");
    expect(baker.scenarios.map((s) => s.label)).toEqual(["Payment with Order", "Net 60 Days"]);
    expect(baker.scenarios[0].fields["pctFinanced"]).toBe("0");
    expect(baker.scenarios[1].fields).toMatchObject({ pctFinanced: "100", financingDays: "45", interestPct: "15" });
    expect(baker.params["targetMarginPct"]).toBe("17");
    expect(baker.chosenId).toBe("pwo");
    expect(baker.items).toEqual(ddp.items); // lines are kept
    expect(switchProfile(baker, "FCA_DAP")).toBe(baker); // no-op
    // and back
    const back = switchProfile(baker, "DDP_IMPORT");
    expect(back.scenarios).toHaveLength(1);
    expect(back.params["targetMarginPct"]).toBe("25");
  });

  it("the switched draft prices the Baker line: 131 (FCA) / 131 (Payment with Order) / 133 (Net 60)", async () => {
    const { db } = makeDb(bakerRfq({ cbuProfile: "DDP_IMPORT" }), bakerItems());
    const baker = switchProfile(sheetToDraft(await loadCbuSheet(db, "b1")), "FCA_DAP");
    const withBase = setScenarioField(setScenarioField(baker, "pwo", "logistics.freightAllInUsd", "1800"), "net60", "logistics.freightAllInUsd", "1100");
    // bank pool needs the contract value for the receive fee (customer outside VN)
    const d = { ...withBase, params: { ...withBase.params, "bank.receiveBaseUsd": "3930" } };
    const price = (id: string) => calculateCbu(draftToEngine(d, id).lines, draftToEngine(d, id).params).lines[0];
    expect(price("pwo").fca!.priceUsd).toBe(131);
    expect(price("pwo").dap!.priceUsd).toBe(131);
    expect(price("net60").dap!.priceUsd).toBe(133);
  });

  it("columns of the Baker table: material + margin % (MARGIN_INPUT); material + FCA price + DAP price (PRICE_INPUT)", () => {
    expect(editableColumns("MARGIN_INPUT", false, "FCA_DAP")).toEqual(["materialUsd", "marginPctOverride"]);
    expect(editableColumns("PRICE_INPUT", false, "FCA_DAP")).toEqual(["materialUsd", "ddpPriceUsdInput", "dapPriceUsdInput"]);
    expect(editableColumns("MARGIN_INPUT", true, "FCA_DAP")).toEqual(["materialUsd", "marginPctOverride"]); // no $ override column
  });

  it("a bad DAP price is flagged under its own key and counts as an error", async () => {
    const { sheet: s } = await sheet();
    const d = setItemValue(sheetToDraft(s), "pwo" in {} ? "pwo" : sheetToDraft(s).scenarios[0].id, "l1", "dapPriceUsdInput", "12x");
    const id = d.scenarios[0].id;
    expect(draftToEngine(d, id).errors[dapPriceErrorKey(id, "l1")]).toMatch(/số hợp lệ/);
    expect(Object.keys(allErrors(d))).toContain(dapPriceErrorKey(id, "l1"));
  });
});

describe("saveCbuSchema — profile, basis and scenario terms", () => {
  const ok = (b: unknown) => saveCbuSchema.safeParse(b).success;
  it("accepts the Baker body", () => {
    expect(ok({ profile: "FCA_DAP", quoteBasis: "DAP", scenarios: TERMS.map((t) => ({ ...t, dapPrices: { l1: 133 } })) })).toBe(true);
  });
  it.each([
    ["unknown profile", { profile: "NOPE" }],
    ["unknown basis", { quoteBasis: "CIF" }],
    ["financed share over 100%", { scenarios: [{ id: "a", label: "A" }, { id: "b", label: "B", overrides: { pctFinanced: 120 } }] }],
    ["negative credit days", { scenarios: [{ id: "a", label: "A", overrides: { financingDays: -1 } }] }],
    ["negative DAP price", { scenarios: [{ id: "a", label: "A", dapPrices: { l1: -1 } }] }],
  ])("rejects %s", (_n, body) => {
    expect(ok(body)).toBe(false);
  });
});
