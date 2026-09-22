import { cbuParamsSchema, saveCbuSchema } from "@/lib/schemas";

const messages = (r: { success: boolean; error?: { errors: { path: (string | number)[]; message: string }[] } }) =>
  r.success ? [] : (r.error?.errors ?? []).map((e) => `${e.path.join(".")}: ${e.message}`);

describe("saveCbuSchema", () => {
  it("accepts a typical save body, all parts optional", () => {
    expect(saveCbuSchema.safeParse({}).success).toBe(true);
    const ok = saveCbuSchema.safeParse({
      mode: "PRICE_INPUT",
      params: {
        fx: 26500,
        targetMarginPct: 25,
        commissionPct: 3,
        citPct: 20,
        goodsOrigin: "Oversea",
        destinationCountry: "VN",
        logistics: { freightFixedUsd: 500, chargeableKg: 1300 },
        insurance: { insuredValuePct: 110, ratePct: 0.01, minUsd: 15 },
        bank: { remitRatePct: 0.2, remitVatFactor: 1.1, receiveBaseUsd: 0 },
      },
      items: [{ id: "a", totalWeightLb: 121.6, materialUsd: 4.37, dutyPct: 0, marginPctOverride: null, ddpPriceUsdInput: 7.1 }],
    });
    expect(ok.success).toBe(true);
  });

  it.each([
    ["margin of 100% leaves no room for a price", { params: { targetMarginPct: 100 } }],
    ["negative margin", { params: { targetMarginPct: -1 } }],
    ["commission of 100%", { params: { commissionPct: 100 } }],
    ["negative freight", { params: { logistics: { freightFixedUsd: -5 } } }],
    ["zero FX rate", { params: { fx: 0 } }],
    ["daysPerYear 0 (division by zero)", { params: { daysPerYear: 0 } }],
    ["non-numeric price", { items: [{ id: "a", materialUsd: "abc" }] }],
    ["NaN weight", { items: [{ id: "a", totalWeightLb: NaN }] }],
    ["empty line id", { items: [{ id: "  " }] }],
    ["unknown mode", { mode: "WHATEVER" }],
    ["margin override of 100%", { items: [{ id: "a", marginPctOverride: 100 }] }],
  ])("rejects %s", (_name, body) => {
    expect(saveCbuSchema.safeParse(body).success).toBe(false);
  });

  it("rejects duplicated line ids", () => {
    const r = saveCbuSchema.safeParse({ items: [{ id: "a" }, { id: "b" }, { id: "a" }] });
    expect(r.success).toBe(false);
    expect(messages(r as never).join(" ")).toContain("items.2.id");
  });

  it("rejects an oversized items array", () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ id: `i${i}` }));
    expect(saveCbuSchema.safeParse({ items }).success).toBe(false);
  });

  it("keeps null (clear override) distinct from an absent field", () => {
    const r = saveCbuSchema.parse({ items: [{ id: "a", marginPctOverride: null }, { id: "b" }] });
    expect(r.items?.[0]).toHaveProperty("marginPctOverride", null);
    expect(r.items?.[1]).not.toHaveProperty("marginPctOverride");
  });

  it("policy constants are not client-editable (receive VAT factor, USD rounding decimals are stripped)", () => {
    const p = cbuParamsSchema.parse({ bank: { receiveVatFactor: 5 }, usdRoundingDecimals: 0 });
    expect(JSON.stringify(p)).not.toMatch(/receiveVatFactor|usdRoundingDecimals/);
  });
});
