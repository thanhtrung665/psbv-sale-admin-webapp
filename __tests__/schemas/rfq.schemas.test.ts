import {
  createRfqManualSchema,
  saveSupplierQuoteSchema,
  saveCustomerPoSchema,
  updateRfqSchema,
} from "@/lib/schemas";

describe("createRfqManualSchema", () => {
  const validPayload = {
    clientName: "Nguyen Van A",
    clientEmail: "a@example.com",
    companyName: "PSBV",
    items: [{ rawPartNumber: "A23-170", rawDescription: "Basic I", qty: 10, uom: "PCS" }],
  };

  it("accepts a valid payload", () => {
    const result = createRfqManualSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("defaults item qty to 1 when omitted", () => {
    const result = createRfqManualSchema.safeParse({
      ...validPayload,
      items: [{ rawPartNumber: "A23-170" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].qty).toBe(1);
    }
  });

  it("rejects missing clientName", () => {
    const { clientName, ...rest } = validPayload;
    const result = createRfqManualSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createRfqManualSchema.safeParse({ ...validPayload, clientEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects empty items array", () => {
    const result = createRfqManualSchema.safeParse({ ...validPayload, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive item quantity", () => {
    const result = createRfqManualSchema.safeParse({
      ...validPayload,
      items: [{ rawPartNumber: "A23-170", qty: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("saveSupplierQuoteSchema", () => {
  const validRow = {
    lineNo: 1,
    partNumber: "A23-170",
    description: "Basic I",
    qty: 10,
    unitPrice: 4.37,
    netWeightLbs: 0.38,
    leadtime: "4 weeks",
    rfqItemId: null,
  };

  it("accepts a valid payload keyed by rfqCode", () => {
    const result = saveSupplierQuoteSchema.safeParse({ rfqCode: "RFO_001", rows: [validRow] });
    expect(result.success).toBe(true);
  });

  it("accepts a valid payload keyed by rfqId", () => {
    const result = saveSupplierQuoteSchema.safeParse({ rfqId: "uuid-1", rows: [validRow] });
    expect(result.success).toBe(true);
  });

  it("rejects when both rfqCode and rfqId are missing", () => {
    const result = saveSupplierQuoteSchema.safeParse({ rows: [validRow] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty rows array", () => {
    const result = saveSupplierQuoteSchema.safeParse({ rfqCode: "RFO_001", rows: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative unitPrice", () => {
    const result = saveSupplierQuoteSchema.safeParse({
      rfqCode: "RFO_001",
      rows: [{ ...validRow, unitPrice: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults netWeightLbs to 0 when omitted", () => {
    const { netWeightLbs, ...rowWithoutWeight } = validRow;
    const result = saveSupplierQuoteSchema.safeParse({ rfqCode: "RFO_001", rows: [rowWithoutWeight] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].netWeightLbs).toBe(0);
    }
  });
});

describe("saveCustomerPoSchema", () => {
  const validRow = {
    lineNo: 1,
    partNumber: "A23-170",
    description: "Basic I",
    qty: 10,
    uom: "PCS",
    agreedDdpPrice: 7.1,
    deliveryDate: "2026-09-30",
  };

  it("accepts a valid payload", () => {
    const result = saveCustomerPoSchema.safeParse({
      rfqCode: "RFO_001",
      poNumber: "PO-123",
      rows: [validRow],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing poNumber", () => {
    const result = saveCustomerPoSchema.safeParse({ rfqCode: "RFO_001", rows: [validRow] });
    expect(result.success).toBe(false);
  });

  it("rejects when neither rfqCode nor rfqId is provided", () => {
    const result = saveCustomerPoSchema.safeParse({ poNumber: "PO-123", rows: [validRow] });
    expect(result.success).toBe(false);
  });
});

describe("updateRfqSchema", () => {
  it("accepts a partial update with a known field", () => {
    const result = updateRfqSchema.safeParse({ status: "RFO_SENT_TO_SUPPLIER" });
    expect(result.success).toBe(true);
  });

  it("strips unknown / dangerous fields instead of erroring (mass-assignment protection)", () => {
    const result = updateRfqSchema.safeParse({
      status: "RFO_SENT_TO_SUPPLIER",
      id: "attacker-controlled-id",
      createdById: "someone-else",
      totalRevenueVnd: "999999999999999999999",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("id");
      expect(result.data).not.toHaveProperty("createdById");
      expect(result.data).not.toHaveProperty("totalRevenueVnd");
      expect(result.data.status).toBe("RFO_SENT_TO_SUPPLIER");
    }
  });

  it("rejects an invalid status enum value", () => {
    const result = updateRfqSchema.safeParse({ status: "NOT_A_REAL_STATUS" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty object (nothing to update)", () => {
    const result = updateRfqSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
