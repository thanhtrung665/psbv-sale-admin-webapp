import { NextRequest } from "next/server";
import { z } from "zod";
import {
  formatZodErrors,
  createValidationErrorResponse,
  validateBody,
  validateQuery,
  validatePathParam,
} from "@/lib/validation";
import { uuidSchema } from "@/lib/schemas/common.schemas";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-valid-json",
  });
}

describe("formatZodErrors", () => {
  it("maps issues to field/message pairs using dot-joined paths", () => {
    const schema = z.object({ email: z.string().email(), items: z.array(z.object({ qty: z.number() })) });
    const result = schema.safeParse({ email: "bad", items: [{ qty: "not-a-number" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "email" }),
          expect.objectContaining({ field: "items.0.qty" }),
        ])
      );
    }
  });

  it("uses _root for a top-level refine() failure with no path", () => {
    const schema = z.object({ a: z.string().optional() }).refine(() => false, { message: "nope" });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      expect(errors).toEqual([{ field: "_root", message: "nope" }]);
    }
  });
});

describe("createValidationErrorResponse", () => {
  it("returns the standard validation-failure JSON shape for a ZodError", async () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const response = createValidationErrorResponse(result.error);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.message).toBe("Validation failed");
      expect(json.errors).toEqual([{ field: "email", message: expect.any(String) }]);
    }
  });

  it("wraps a plain Error under the same response shape", async () => {
    const response = createValidationErrorResponse(new Error("boom"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual([{ field: "_root", message: "boom" }]);
  });

  it("honours a custom status code", () => {
    const response = createValidationErrorResponse(new Error("boom"), 422);
    expect(response.status).toBe(422);
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns success:true with parsed data for a valid body", async () => {
    const req = makeRequest({ name: "Test" });
    const result = await validateBody(req, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Test" });
    }
  });

  it("returns a 400 response for a schema violation", async () => {
    const req = makeRequest({ name: "" });
    const result = await validateBody(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json.success).toBe(false);
    }
  });

  it("returns a 400 response for malformed JSON instead of throwing", async () => {
    const req = makeInvalidJsonRequest();
    const result = await validateBody(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("validateQuery", () => {
  const schema = z.object({ search: z.string().default("") });

  it("parses search params into the schema shape", () => {
    const url = new URL("http://localhost/api/test?search=hello");
    const result = validateQuery(url, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("hello");
    }
  });

  it("applies schema defaults for missing params", () => {
    const url = new URL("http://localhost/api/test");
    const result = validateQuery(url, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("");
    }
  });

  it("fails when a required param is missing", () => {
    const strictSchema = z.object({ id: z.string().min(1) });
    const url = new URL("http://localhost/api/test");
    const result = validateQuery(url, strictSchema);
    expect(result.success).toBe(false);
  });
});

describe("validatePathParam", () => {
  it("accepts a non-empty string with the default schema", () => {
    const result = validatePathParam("abc-123", "id");
    expect(result.success).toBe(true);
  });

  it("rejects undefined", () => {
    const result = validatePathParam(undefined, "id");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = validatePathParam("", "id");
    expect(result.success).toBe(false);
  });

  it("supports a custom schema (e.g. UUID)", () => {
    const good = validatePathParam("550e8400-e29b-41d4-a716-446655440000", "id", uuidSchema);
    expect(good.success).toBe(true);

    const bad = validatePathParam("not-a-uuid", "id", uuidSchema);
    expect(bad.success).toBe(false);
  });
});
