/**
 * Pure logic behind the CBU workspace: number parsing, draft ⇄ engine/save conversion, defaults badges, paste.
 */
import { calculateCbu } from "../../../src/lib/cbu";
import { CBU_DEFAULTS } from "../../../src/lib/cbu/defaults";
import {
  PARAM_FIELDS,
  MAX_SCENARIOS,
  addScenario,
  allErrors,
  applyPaste,
  getItemValue,
  priceErrorKey,
  removeScenario,
  renameScenario,
  scenarioErrorKey,
  setChosen,
  setItemValue,
  setScenarioField,
  defaultAsString,
  draftToEngine,
  draftToSaveInput,
  isDirty,
  isParamModified,
  itemErrorKey,
  modifiedCount,
  numToStr,
  paramErrorKey,
  parseClipboardMatrix,
  parseNumber,
  sheetToDraft,
  type Draft,
} from "../../../src/lib/cbu/ui/draft";
import { fmtNum, fmtPct, fmtUsd, fmtVnd, marginTone } from "../../../src/lib/cbu/ui/format";
import { saveCbuSchema } from "../../../src/lib/schemas/cbu.schemas";
import type { CbuSheet } from "../../../src/lib/cbu/db/service";
import { AC0084_AIR, AC0084_LOGISTICS, AC0084_PARAMS, AC0084_TOTALS } from "../fixtures/ac0084";

// A sheet as GET /api/rfq/[id]/cbu returns it (only the fields the draft reads).
function sheetFor(air = true): CbuSheet {
  const l = AC0084_LOGISTICS[air ? "air" : "sea"];
  const params = {
    ...CBU_DEFAULTS,
    fx: AC0084_PARAMS.fx,
    logistics: { ...CBU_DEFAULTS.logistics, freightFixedUsd: l.freightFixedUsd, freightRatePerKg: l.freightRatePerKg, chargeableKg: l.chargeableKg, clearanceUsd: l.clearanceUsd, inlandUsd: l.inlandUsd },
  };
  return {
    rfq: { id: "r1", rfqCode: "X", status: "SUPPLIER_QUOTED", incoTerm: null, paymentTerm: null, supplierName: null, clientName: null },
    profile: "DDP_IMPORT",
    mode: "MARGIN_INPUT",
    params,
    items: AC0084_AIR.map((r) => ({
      id: `l${r.lineNo}`, lineNo: r.lineNo, rawPartNumber: r.partNo, rawDescription: "", uom: "PCS", qty: r.qty,
      materialUsd: r.materialUsd, totalWeightLb: r.totalWeightLb, dutyPct: r.dutyPct,
      marginPctOverride: null, marginUsdOverride: null, ddpPriceUsdInput: null, savedDdpPriceUsd: null,
    })),
    scenarios: [{ id: "air", label: "Air", logistics: params.logistics, prices: {}, result: {} as CbuSheet["result"] }],
    chosenScenarioId: "air",
    result: {} as CbuSheet["result"],
    saved: { calculatedAt: null, totalCostUsd: null, totalRevenueUsd: null, totalRevenueVnd: null, totalMarginUsd: null, actualMarginPct: null },
  };
}

describe("parseNumber", () => {
  it.each([
    ["4.37", 4.37], ["4,37", 4.37], ["  25 ", 25], ["$4.37", 4.37], ["25%", 25], [".5", 0.5], ["-3", -3],
    ["1,234.56", 1234.56], ["1,234", 1234], ["12,345,678", 12345678], ["0,5", 0.5], ["1 000", 1000],
  ])("%s → %s", (raw, expected) => {
    expect(parseNumber(raw)).toEqual({ ok: true, value: expected });
  });

  it("blank is null, not 0", () => {
    expect(parseNumber("")).toEqual({ ok: true, value: null });
    expect(parseNumber("   ")).toEqual({ ok: true, value: null });
  });

  it.each(["abc", "1.2.3", "1,2,3", "12abc", "--5", "1e5x", "."])("rejects %s", (raw) => {
    expect(parseNumber(raw)).toEqual({ ok: false });
  });

  it("numToStr removes float noise and maps null/NaN to ''", () => {
    expect(numToStr(0.38000000000000006)).toBe("0.38");
    expect(numToStr(121.6)).toBe("121.6");
    expect(numToStr(0)).toBe("0");
    expect(numToStr(null)).toBe("");
    expect(numToStr(NaN)).toBe("");
  });
});

describe("sheetToDraft → draftToEngine", () => {
  it("round-trips a sheet and reproduces the Excel numbers through the engine", () => {
    const draft = sheetToDraft(sheetFor());
    const { params, lines, errors } = draftToEngine(draft);
    expect(errors).toEqual({});
    const r = calculateCbu(lines, params);
    expect(r.lines[0].ddpPriceUsd).toBe(7.1);
    expect(r.totals.revenueVnd).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("keeps a blank margin override as null (use the target), never 0%", () => {
    const { lines } = draftToEngine(sheetToDraft(sheetFor()));
    expect(lines.every((l) => l.marginPctOverride === null && l.marginUsdOverride === null && l.ddpPriceUsdInput === null)).toBe(true);
    const d = sheetToDraft(sheetFor());
    d.items[0].marginPctOverride = "0";
    expect(draftToEngine(d).lines[0].marginPctOverride).toBe(0); // a typed 0 is a real 0%
  });

  it("a blank parameter takes the default on the preview side (and in the save input)", () => {
    const d = sheetToDraft(sheetFor());
    d.params["targetMarginPct"] = "";
    d.scenarios[0].logistics["logistics.clearanceUsd"] = "";
    const { params } = draftToEngine(d);
    expect(params.targetMarginPct).toBe(CBU_DEFAULTS.targetMarginPct);
    expect(params.logistics?.clearanceUsd).toBe(0);
    expect(draftToSaveInput(d).params?.targetMarginPct).toBe(CBU_DEFAULTS.targetMarginPct);
  });

  it("reports errors per field (key = params.<path> / items.<id>.<field>) and never throws", () => {
    const d = sheetToDraft(sheetFor());
    d.params["fx"] = "abc";
    d.params["targetMarginPct"] = "100";
    d.params["commissionPct"] = "-1";
    d.params["lbToKg"] = "0";
    d.items[1].materialUsd = "12x";
    d.items[2].dutyPct = "101";
    d.items[3].marginPctOverride = "100";
    const { errors } = draftToEngine(d);
    expect(errors[paramErrorKey("fx")]).toMatch(/số hợp lệ/);
    expect(errors[paramErrorKey("targetMarginPct")]).toMatch(/nhỏ hơn 100/);
    expect(errors[paramErrorKey("commissionPct")]).toMatch(/âm/);
    expect(errors[paramErrorKey("lbToKg")]).toMatch(/lớn hơn 0/);
    expect(errors[itemErrorKey("l2", "materialUsd")]).toMatch(/số hợp lệ/);
    expect(errors[itemErrorKey("l3", "dutyPct")]).toMatch(/Tối đa 100/);
    expect(errors[itemErrorKey("l4", "marginPctOverride")]).toMatch(/nhỏ hơn 100/);
  });

  it("the save input is complete and passes the server's Zod schema", () => {
    const d = sheetToDraft(sheetFor());
    d.mode = "PRICE_INPUT";
    Object.assign(d, setItemValue(d, "air", "l1", "ddpPriceUsdInput", "7.10"));
    d.items[1].marginPctOverride = "";
    const input = draftToSaveInput(d);
    expect(input.items).toHaveLength(16);
    expect(input.items?.[0]).toMatchObject({ id: "l1", marginPctOverride: null });
    expect(input.items?.[0]).not.toHaveProperty("ddpPriceUsdInput");
    expect(input.scenarios?.[0].prices).toEqual({ l1: 7.1 });
    expect(input.params).not.toHaveProperty("mode");
    const parsed = saveCbuSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("text / select parameters are passed as trimmed text", () => {
    const d = sheetToDraft(sheetFor());
    d.params["destinationCountry"] = " MY ";
    d.params["goodsOrigin"] = "Local";
    const { params } = draftToEngine(d);
    expect(params.destinationCountry).toBe("MY");
    expect(params.goodsOrigin).toBe("Local");
  });
});

describe("defaults badges", () => {
  it("a fresh sheet has no modified fields in the policy group; typed values do", () => {
    const d = sheetToDraft(sheetFor());
    const policy = PARAM_FIELDS.filter((f) => f.group === "policy");
    expect(modifiedCount(d, policy)).toBe(0);
    d.params["bank.remitRatePct"] = "0.3";
    d.params["financingDays"] = "45";
    expect(modifiedCount(d, policy)).toBe(2);
  });

  it("blank counts as default; garbage counts as modified; defaultAsString is what reset writes back", () => {
    const d = sheetToDraft(sheetFor());
    const f = PARAM_FIELDS.find((x) => x.path === "interestPct")!;
    d.params[f.path] = "";
    expect(isParamModified(d, f)).toBe(false);
    d.params[f.path] = "abc";
    expect(isParamModified(d, f)).toBe(true);
    expect(defaultAsString(f)).toBe("15");
    expect(defaultAsString(PARAM_FIELDS.find((x) => x.path === "goodsOrigin")!)).toBe("Oversea");
  });

  it("every parameter path exists in the engine defaults (no typo in the field table)", () => {
    const missing = PARAM_FIELDS.filter((f) => defaultAsString(f) === "").map((f) => f.path);
    // destinationCountry / goodsOrigin have text defaults, all others numeric — none may be empty
    expect(missing).toEqual([]);
  });
});

describe("isDirty", () => {
  it("is false for an identical draft and true after any edit", () => {
    const a = sheetToDraft(sheetFor());
    const b = sheetToDraft(sheetFor());
    expect(isDirty(a, b)).toBe(false);
    b.items[3].dutyPct = "5";
    expect(isDirty(a, b)).toBe(true);
    const c = sheetToDraft(sheetFor());
    c.mode = "PRICE_INPUT";
    expect(isDirty(a, c)).toBe(true);
  });
});

describe("paste from Excel", () => {
  const cols = ["totalWeightLb", "materialUsd", "dutyPct"] as const;

  it("parses tab/newline text and drops trailing empty rows", () => {
    expect(parseClipboardMatrix("1\t2\r\n3\t4\r\n\r\n")).toEqual([["1", "2"], ["3", "4"]]);
    expect(parseClipboardMatrix("5")).toEqual([["5"]]);
  });

  it("a single column pasted down from row 2 fills consecutive lines of that column only", () => {
    const d = sheetToDraft(sheetFor());
    const out = applyPaste(d, "air", 1, 1, [["4.5"], ["4.6"], ["4.7"]], [...cols]);
    expect(out.items.slice(1, 4).map((i) => i.materialUsd)).toEqual(["4.5", "4.6", "4.7"]);
    expect(out.items[0].materialUsd).toBe(d.items[0].materialUsd);
    expect(out.items[4].materialUsd).toBe(d.items[4].materialUsd);
    expect(out.items[1].totalWeightLb).toBe(d.items[1].totalWeightLb);
  });

  it("a block spreads across columns; '$', '%' and spaces are stripped; extra cells/rows are ignored", () => {
    const d = sheetToDraft(sheetFor());
    const out = applyPaste(d, "air", 14, 0, [["10", "$1.5", "5%", "junk"], ["20", "2.5", "6"], ["30", "3.5", "7"]], [...cols]);
    expect(out.items[14]).toMatchObject({ totalWeightLb: "10", materialUsd: "1.5", dutyPct: "5" });
    expect(out.items[15]).toMatchObject({ totalWeightLb: "20", materialUsd: "2.5", dutyPct: "6" });
    expect(out.items).toHaveLength(16);
  });

  it("does not mutate the previous draft", () => {
    const d = sheetToDraft(sheetFor());
    const snapshot = JSON.stringify(d);
    applyPaste(d, "air", 0, 0, [["1"]], [...cols]);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("pasted text goes through the same validation as typed text", () => {
    const d = applyPaste(sheetToDraft(sheetFor()), "air", 0, 1, [["abc"]], [...cols]);
    expect(draftToEngine(d as Draft).errors[itemErrorKey("l1", "materialUsd")]).toMatch(/số hợp lệ/);
  });
});

describe("format", () => {
  it("USD / number / percent / VND", () => {
    expect(fmtUsd(5.5)).toBe("$5.50");
    expect(fmtUsd(-1.2)).toBe("-$1.20");
    expect(fmtUsd(24576.9777)).toBe("$24,576.98");
    expect(fmtNum(0.1724, 4)).toBe("0.1724");
    expect(fmtPct(25.0447)).toBe("25.04%");
    expect(fmtVnd(890800000)).toBe("890.800.000");
    expect(fmtVnd(190000.4)).toBe("190.000");
  });

  it("never prints NaN / Infinity", () => {
    for (const bad of [NaN, Infinity, undefined, null, "x"]) {
      expect(fmtNum(bad)).toBe("0.00");
      expect(fmtUsd(bad)).toBe("$0.00");
      expect(fmtVnd(bad)).toBe("0");
    }
  });

  it("margin tone: loss / thin / good / none", () => {
    expect(marginTone(-2, true, 25)).toBe("loss");
    expect(marginTone(10, true, 25)).toBe("thin");
    expect(marginTone(25.04, true, 25)).toBe("good");
    expect(marginTone(24.5, true, 25)).toBe("good"); // within 1 point of target is not "thin"
    expect(marginTone(0, false, 25)).toBe("none");
  });
});

// ─── Scenarios (Air / Sea) ────────────────────────────────────────────────────
describe("scenarios in the draft", () => {
  const sea = AC0084_LOGISTICS.sea;
  /** Air (base) + Sea, exactly as the workbook has them. */
  function airAndSea() {
    const added = addScenario(sheetToDraft(sheetFor()), "air")!;
    const id = added.id;
    let d = setScenarioField(added.draft, id, "logistics.freightFixedUsd", String(sea.freightFixedUsd));
    d = setScenarioField(d, id, "logistics.freightRatePerKg", String(sea.freightRatePerKg));
    d = setScenarioField(d, id, "logistics.chargeableKg", String(sea.chargeableKg));
    d = renameScenario(renameScenario(d, "air", "Air"), id, "Sea");
    return { d, seaId: id };
  }
  const revenueVnd = (d: Draft, id: string) => {
    const e = draftToEngine(d, id);
    return calculateCbu(e.lines, e.params).totals.revenueVnd;
  };

  it("adding copies the active scenario (logistics and prices) and gets a fresh id", () => {
    const d0 = setItemValue(sheetToDraft(sheetFor()), "air", "l1", "ddpPriceUsdInput", "7.1");
    const { draft, id } = addScenario(d0, "air")!;
    expect(id).toBe("s2");
    expect(draft.scenarios).toHaveLength(2);
    expect(draft.scenarios[1].logistics).toEqual(draft.scenarios[0].logistics);
    expect(draft.scenarios[1].prices).toEqual({ l1: "7.1" });
    expect(draft.scenarios[1].logistics).not.toBe(draft.scenarios[0].logistics); // a copy, not shared
    expect(addScenario(draft, "s2")!.id).toBe("s3");
  });

  it("each scenario reproduces its Excel block and the difference matches the workbook (112,000,000 ₫)", () => {
    const { d, seaId } = airAndSea();
    expect(revenueVnd(d, "air")).toBe(AC0084_TOTALS.air.totalRevenueVnd);
    expect(revenueVnd(d, seaId)).toBe(AC0084_TOTALS.sea.totalRevenueVnd);
    expect(revenueVnd(d, "air") - revenueVnd(d, seaId)).toBe(112_000_000);
  });

  it("editing one scenario's logistics never changes another's", () => {
    const { d, seaId } = airAndSea();
    const before = revenueVnd(d, "air");
    const d2 = setScenarioField(d, seaId, "logistics.clearanceUsd", "999");
    expect(revenueVnd(d2, "air")).toBe(before);
    expect(revenueVnd(d2, seaId)).toBeGreaterThan(revenueVnd(d, seaId));
  });

  it("the save input puts the FIRST scenario's logistics in params and only the others as overrides", () => {
    const { d, seaId } = airAndSea();
    const s = draftToSaveInput(d);
    expect(s.params?.logistics).toMatchObject({ freightFixedUsd: 500, freightRatePerKg: 2.5, chargeableKg: 1300 });
    expect(s.scenarios?.map((x) => x.id)).toEqual(["air", seaId]);
    expect(s.scenarios?.[0]).not.toHaveProperty("overrides");
    expect(s.scenarios?.[1].overrides?.logistics).toMatchObject({ freightFixedUsd: 800, freightRatePerKg: 0, chargeableKg: 0 });
    expect(s.scenarios?.map((x) => x.label)).toEqual(["Air", "Sea"]);
    expect(s.chosenScenarioId).toBe("air");
    expect(saveCbuSchema.safeParse(s).success).toBe(true);
  });

  it("prices are per scenario", () => {
    const { d, seaId } = airAndSea();
    let x = setItemValue(d, "air", "l1", "ddpPriceUsdInput", "7.10");
    x = setItemValue(x, seaId, "l1", "ddpPriceUsdInput", "6.41");
    expect(getItemValue(x, "air", x.items[0], "ddpPriceUsdInput")).toBe("7.10");
    expect(getItemValue(x, seaId, x.items[0], "ddpPriceUsdInput")).toBe("6.41");
    expect(getItemValue(x, "air", x.items[0], "materialUsd")).toBe("4.37"); // other fields are shared
    const s = draftToSaveInput(x);
    expect(s.scenarios?.map((sc) => sc.prices)).toEqual([{ l1: 7.1 }, { l1: 6.41 }]);
  });

  it("choose / remove: the chosen scenario can change; the last scenario cannot be removed; removing the chosen one falls back to the first", () => {
    const { d, seaId } = airAndSea();
    expect(setChosen(d, seaId).chosenId).toBe(seaId);
    expect(setChosen(d, "nope").chosenId).toBe("air");
    const onlyAir = removeScenario(setChosen(d, seaId), seaId);
    expect(onlyAir.scenarios.map((s) => s.id)).toEqual(["air"]);
    expect(onlyAir.chosenId).toBe("air");
    expect(removeScenario(onlyAir, "air").scenarios).toHaveLength(1); // the last one stays
  });

  it("is capped at MAX_SCENARIOS", () => {
    let d = sheetToDraft(sheetFor());
    for (let i = 1; i < MAX_SCENARIOS; i++) d = addScenario(d, "air")!.draft;
    expect(d.scenarios).toHaveLength(MAX_SCENARIOS);
    expect(addScenario(d, "air")).toBeNull();
  });

  it("errors in ANY scenario block saving and are keyed by scenario", () => {
    const { d, seaId } = airAndSea();
    const bad = setItemValue(setScenarioField(d, seaId, "logistics.inlandUsd", "x1"), seaId, "l3", "ddpPriceUsdInput", "-5");
    const errs = allErrors(bad);
    expect(errs[scenarioErrorKey(seaId, "logistics.inlandUsd")]).toMatch(/số hợp lệ/);
    expect(errs[priceErrorKey(seaId, "l3")]).toMatch(/âm/);
    expect(Object.keys(allErrors(d))).toEqual([]);
    // the error is only shown while looking at that scenario, but it is always counted
    expect(draftToEngine(bad, "air").errors[scenarioErrorKey(seaId, "logistics.inlandUsd")]).toBeUndefined();
  });

  it("a rename or a change of the chosen scenario makes the draft dirty", () => {
    const { d, seaId } = airAndSea();
    expect(isDirty(d, renameScenario(d, seaId, "Đường biển"))).toBe(true);
    expect(isDirty(d, setChosen(d, seaId))).toBe(true);
  });
});
