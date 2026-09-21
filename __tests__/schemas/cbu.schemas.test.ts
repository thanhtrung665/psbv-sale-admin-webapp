import { cbuParamsSchema, legacyCalculateCbuSchema, saveCbuSchema } from "@/lib/schemas";
import { legacyBodyToSaveInput } from "@/lib/cbu/db/legacy-body";

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

describe("legacy body → v2 input", () => {
  const body = legacyCalculateCbuSchema.parse({
    finalize: true,
    cbuMode: "MARGIN_INPUT",
    exchangeRate: 26500,
    freightFixed: 500,
    freightRatePerKg: 2.5,
    chargeableWeightKg: 1300,
    clearanceCost: 150,
    inlandCost: null,
    docFee: 0,
    bankVatFactor: 1.1,
    remittanceRatePercent: 0.2,
    targetMarginPercent: 25,
    commissionRate: 3,
    citOnCommission: 20,
    items: [{ id: "a", supplierUnitPrice: 4.37, netWeightLbs: 0.38, dutyPercent: 0, marginPercent: null, marginOverrideUsd: 0, targetDdpPriceUsd: 0 }],
  });

  it("renames fields and keeps units (percent numbers stay percent numbers)", () => {
    const input = legacyBodyToSaveInput(body);
    expect(input.mode).toBe("MARGIN_INPUT");
    expect(input.params?.fx).toBe(26500);
    expect(input.params?.logistics).toMatchObject({ freightFixedUsd: 500, freightRatePerKg: 2.5, chargeableKg: 1300, clearanceUsd: 150, otherUsd: 0 });
    expect(input.params?.bank).toMatchObject({ remitRatePct: 0.2, remitVatFactor: 1.1 });
    expect(input.params?.commissionPct).toBe(3);
    expect(input.params?.citPct).toBe(20);
  });

  it("null in the legacy body means 'keep the stored value' (undefined), not 0", () => {
    const input = legacyBodyToSaveInput(body);
    expect(input.params?.logistics?.inlandUsd).toBeUndefined();
  });

  it("per-unit weight travels as weightLbPerUnit; a blank margin override stays null, never 0", () => {
    const item = legacyBodyToSaveInput(body).items?.[0];
    expect(item).toMatchObject({ id: "a", materialUsd: 4.37, weightLbPerUnit: 0.38, marginPctOverride: null, marginUsdOverride: 0 });
    expect(item).not.toHaveProperty("totalWeightLb");
  });

  it("the converted input passes the v2 schema (bounds are enforced on the legacy path too)", () => {
    expect(saveCbuSchema.safeParse(legacyBodyToSaveInput(body)).success).toBe(true);
    const bad = legacyCalculateCbuSchema.parse({ targetMarginPercent: 120, items: [] });
    expect(saveCbuSchema.safeParse(legacyBodyToSaveInput(bad)).success).toBe(false);
  });

  it("rejects non-finite numbers in the legacy body itself", () => {
    expect(legacyCalculateCbuSchema.safeParse({ exchangeRate: "x" }).success).toBe(false);
  });
});
