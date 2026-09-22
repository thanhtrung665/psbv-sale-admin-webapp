/**
 * Unit tests for draftQuotationEmailWithGemini (SPEC.md §13, Email Review Agent v1). `@google/generative-ai`
 * is mocked — no network call, no real API key needed. This proves the module builds a sane prompt, strips
 * markdown fences, and always validates Gemini's JSON through Zod before returning it (never trusts it raw).
 */
let generateContentMock: jest.Mock;
let getGenerativeModelMock: jest.Mock;
let constructorCalls: string[];

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation((apiKey: string) => {
    constructorCalls.push(apiKey);
    return { getGenerativeModel: getGenerativeModelMock };
  }),
}));

import { draftQuotationEmailWithGemini, type QuotationEmailContext } from "../../src/lib/agent/draft-quotation-email";

function mockResponse(text: string) {
  generateContentMock.mockResolvedValue({ response: { text: () => text } });
}

const baseCtx: QuotationEmailContext = {
  rfqCode: "AC0084",
  clientName: "John Doe",
  companyName: "Acme Co",
  incoTerm: "DDP",
  paymentTerm: "30 Days Net",
  totalRevenueUsd: 1234.56,
  items: [{ partNumber: "A23-170", description: "Insert", qty: 320 }],
};

beforeEach(() => {
  generateContentMock = jest.fn();
  getGenerativeModelMock = jest.fn().mockReturnValue({ generateContent: generateContentMock });
  constructorCalls = [];
});

describe("draftQuotationEmailWithGemini", () => {
  it("parses a clean JSON response", async () => {
    mockResponse(JSON.stringify({ subject: "Quotation AC0084", bodyHtml: "<p>Dear John,</p>" }));
    const out = await draftQuotationEmailWithGemini(baseCtx, { apiKey: "k" });
    expect(out).toEqual({ subject: "Quotation AC0084", bodyHtml: "<p>Dear John,</p>" });
  });

  it("strips ```json markdown fences before parsing", async () => {
    mockResponse('```json\n{"subject":"S","bodyHtml":"<p>B</p>"}\n```');
    const out = await draftQuotationEmailWithGemini(baseCtx, { apiKey: "k" });
    expect(out).toEqual({ subject: "S", bodyHtml: "<p>B</p>" });
  });

  it("defaults missing fields to empty strings instead of throwing (schema, not a bare cast)", async () => {
    mockResponse("{}");
    const out = await draftQuotationEmailWithGemini(baseCtx, { apiKey: "k" });
    expect(out).toEqual({ subject: "", bodyHtml: "" });
  });

  it("throws a clear Vietnamese error on genuinely invalid JSON", async () => {
    mockResponse("not json at all");
    await expect(draftQuotationEmailWithGemini(baseCtx, { apiKey: "k" })).rejects.toThrow("JSON không hợp lệ");
  });

  it("passes the given apiKey/modelName through instead of always using the default", async () => {
    mockResponse('{"subject":"S","bodyHtml":"B"}');
    await draftQuotationEmailWithGemini(baseCtx, { apiKey: "custom-key", modelName: "gemini-custom" });
    expect(constructorCalls).toEqual(["custom-key"]);
    expect(getGenerativeModelMock).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-custom" }));
  });

  it("includes the RFQ code and up to 10 items in the prompt sent to Gemini", async () => {
    mockResponse('{"subject":"S","bodyHtml":"B"}');
    const manyItems = Array.from({ length: 15 }, (_, i) => ({ partNumber: `P${i}`, description: "x", qty: 1 }));
    await draftQuotationEmailWithGemini({ ...baseCtx, items: manyItems }, { apiKey: "k" });

    const promptText = generateContentMock.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(promptText).toContain("AC0084");
    expect(promptText).toContain("P0");
    expect(promptText).toContain("P9");
    expect(promptText).not.toContain("P10"); // only the first 10 items go into the prompt
  });

  it("omits an incoterm/payment term line when the RFQ doesn't have one, rather than printing 'null'", async () => {
    mockResponse('{"subject":"S","bodyHtml":"B"}');
    await draftQuotationEmailWithGemini({ ...baseCtx, incoTerm: null, paymentTerm: null }, { apiKey: "k" });
    const promptText = generateContentMock.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(promptText).not.toContain("null");
    expect(promptText).not.toContain("Incoterm");
  });
});
