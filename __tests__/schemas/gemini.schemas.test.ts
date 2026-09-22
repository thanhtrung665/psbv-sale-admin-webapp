import {
  fillLineNumbers,
  geminiCiplSchema,
  geminiCustomerPoSchema,
  geminiInquirySchema,
  geminiSupplierQuoteSchema,
} from "@/lib/schemas";

describe("geminiInquirySchema", () => {
  it("defaults every missing field instead of throwing", () => {
    const r = geminiInquirySchema.parse({});
    expect(r).toEqual({ clientName: "", clientEmail: "", companyName: "", clientPhone: "", items: [] });
  });

  it("coerces a malformed qty (NaN) to 1, same as the old `Number(x) || 1`", () => {
    const r = geminiInquirySchema.parse({ items: [{ rawPartNumber: "P1", qty: "not-a-number" }] });
    expect(r.items[0]).toMatchObject({ rawPartNumber: "P1", qty: 1, uom: "PCS" });
  });

  it("drops null/non-object entries from items instead of crashing", () => {
    const r = geminiInquirySchema.parse({ items: [null, "oops", { rawPartNumber: "P1" }, 42] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].rawPartNumber).toBe("P1");
  });

  it("treats a non-array items as empty, not a crash", () => {
    const r = geminiInquirySchema.parse({ items: "not-an-array" });
    expect(r.items).toEqual([]);
  });

  it("a completely broken response (not even an object) throws instead of silently becoming garbage", () => {
    expect(() => geminiInquirySchema.parse(null)).toThrow();
    expect(() => geminiInquirySchema.parse("plain text, not JSON shape")).toThrow();
  });
});

describe("fillLineNumbers", () => {
  it("fills missing lineNo with the 1-based index", () => {
    const items: Array<{ lineNo?: number; a: number }> = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const r = fillLineNumbers(items);
    expect(r.map((x) => x.lineNo)).toEqual([1, 2, 3]);
  });

  it("keeps an explicit positive lineNo", () => {
    const r = fillLineNumbers([{ lineNo: 5 }, { lineNo: undefined }]);
    expect(r.map((x) => x.lineNo)).toEqual([5, 2]);
  });

  it("replaces a non-positive lineNo (0 or negative) with the index, same as the old `|| idx + 1`", () => {
    const r = fillLineNumbers([{ lineNo: 0 }, { lineNo: -3 }]);
    expect(r.map((x) => x.lineNo)).toEqual([1, 2]);
  });
});

describe("geminiSupplierQuoteSchema", () => {
  it("normalises PascalCase keys Gemini has been seen to echo back", () => {
    const r = geminiSupplierQuoteSchema.parse({
      items: [{ PartNumber: "P1", Description: "Widget", UnitPrice: 4.5, NetWeight: 1.2, ExtWeight: 2.4, LeadTime: "2 weeks" }],
    });
    expect(r.items[0]).toEqual({
      partNumber: "P1",
      description: "Widget",
      supplierUnitPrice: 4.5,
      netWeightLbs: 1.2,
      extWeightLbs: 2.4,
      leadTime: "2 weeks",
    });
  });

  it("prefers the canonical camelCase key when both are present", () => {
    const r = geminiSupplierQuoteSchema.parse({ items: [{ partNumber: "camel", PartNumber: "pascal" }] });
    expect(r.items[0].partNumber).toBe("camel");
  });

  it("defaults a missing price to 0, not NaN", () => {
    const r = geminiSupplierQuoteSchema.parse({ items: [{ partNumber: "P1" }] });
    expect(r.items[0].supplierUnitPrice).toBe(0);
  });
});

describe("geminiCustomerPoSchema", () => {
  it("defaults currency to USD and empty items to []", () => {
    const r = geminiCustomerPoSchema.parse({});
    expect(r.currency).toBe("USD");
    expect(r.items).toEqual([]);
  });

  it("defaults agreedDdpPrice/qty for a malformed item", () => {
    const r = geminiCustomerPoSchema.parse({ items: [{ partNumber: "P1", qty: null, agreedDdpPrice: undefined }] });
    expect(r.items[0]).toMatchObject({ qty: 1, agreedDdpPrice: 0 });
  });
});

describe("geminiCiplSchema", () => {
  it("defaults every string field to '' instead of passing through null (the old bare cast let this through)", () => {
    const r = geminiCiplSchema.parse({ invoice_no: null, po_no: undefined, items: [] });
    expect(r.invoice_no).toBe("");
    expect(r.po_no).toBe("");
  });

  it("treats items missing entirely as []", () => {
    const r = geminiCiplSchema.parse({});
    expect(r.items).toEqual([]);
  });

  it("defaults every line-item field to a string", () => {
    const r = geminiCiplSchema.parse({ items: [{ part_no: "P1" }] });
    expect(r.items[0]).toEqual({
      part_no: "P1", description: "", hs_code: "", quantity: "", country_origin: "",
      uom: "", unit_price: "", ext_price: "", batch_no: "", net_weight: "",
    });
  });
});
