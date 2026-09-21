/**
 * Pure logic behind the CBU workspace: number parsing, draft ⇄ engine/save conversion, defaults badges, paste.
 */
import { calculateCbu } from "../../../src/lib/cbu";
import { CBU_DEFAULTS } from "../../../src/lib/cbu/defaults";
import {
  PARAM_FIELDS,
  applyPaste,
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
    d.params["logistics.clearanceUsd"] = "";
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
    d.items[0].ddpPriceUsdInput = "7.10";
    d.items[1].marginPctOverride = "";
    const input = draftToSaveInput(d);
    expect(input.items).toHaveLength(16);
    expect(input.items?.[0]).toMatchObject({ id: "l1", ddpPriceUsdInput: 7.1, marginPctOverride: null });
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
    const out = applyPaste(d, 1, 1, [["4.5"], ["4.6"], ["4.7"]], [...cols]);
    expect(out.items.slice(1, 4).map((i) => i.materialUsd)).toEqual(["4.5", "4.6", "4.7"]);
    expect(out.items[0].materialUsd).toBe(d.items[0].materialUsd);
    expect(out.items[4].materialUsd).toBe(d.items[4].materialUsd);
    expect(out.items[1].totalWeightLb).toBe(d.items[1].totalWeightLb);
  });

  it("a block spreads across columns; '$', '%' and spaces are stripped; extra cells/rows are ignored", () => {
    const d = sheetToDraft(sheetFor());
    const out = applyPaste(d, 14, 0, [["10", "$1.5", "5%", "junk"], ["20", "2.5", "6"], ["30", "3.5", "7"]], [...cols]);
    expect(out.items[14]).toMatchObject({ totalWeightLb: "10", materialUsd: "1.5", dutyPct: "5" });
    expect(out.items[15]).toMatchObject({ totalWeightLb: "20", materialUsd: "2.5", dutyPct: "6" });
    expect(out.items).toHaveLength(16);
  });

  it("does not mutate the previous draft", () => {
    const d = sheetToDraft(sheetFor());
    const snapshot = JSON.stringify(d);
    applyPaste(d, 0, 0, [["1"]], [...cols]);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("pasted text goes through the same validation as typed text", () => {
    const d = applyPaste(sheetToDraft(sheetFor()), 0, 1, [["abc"]], [...cols]);
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
