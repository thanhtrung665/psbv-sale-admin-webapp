import { createClientSchema, updateClientSchema } from "@/lib/schemas";

describe("createClientSchema", () => {
  const validPayload = {
    name: "Nguyen Van A",
    companyName: "PSBV Trading",
    email: "client@example.com",
    phone: "0900000000",
    address: "123 Le Loi, HCMC",
  };

  it("accepts a valid payload", () => {
    const result = createClientSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a payload without optional phone/address", () => {
    const { phone, address, ...rest } = validPayload;
    const result = createClientSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const { name, ...rest } = validPayload;
    const result = createClientSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing companyName", () => {
    const { companyName, ...rest } = validPayload;
    const result = createClientSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = createClientSchema.safeParse({ ...validPayload, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string name (whitespace only)", () => {
    const result = createClientSchema.safeParse({ ...validPayload, name: "   " });
    expect(result.success).toBe(false);
  });
});

describe("updateClientSchema", () => {
  it("requires the same fields as create", () => {
    const result = updateClientSchema.safeParse({ email: "client@example.com" });
    expect(result.success).toBe(false);
  });

  it("accepts a fully valid update payload", () => {
    const result = updateClientSchema.safeParse({
      name: "Nguyen Van B",
      companyName: "PSBV Trading",
      email: "b@example.com",
    });
    expect(result.success).toBe(true);
  });
});
