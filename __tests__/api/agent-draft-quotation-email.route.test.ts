/**
 * Integration test for POST /api/rfq/[id]/agent/draft-quotation-email — exercises the real route handler
 * (auth, rate-limit, RFQ lookup, AiConfig lookup) with next-auth, @/lib/prisma and the Gemini-calling draft
 * function mocked. The draft function itself has its own unit tests
 * (__tests__/agent/draft-quotation-email.test.ts); this only proves the route wires everything together and
 * never sends an email or writes to the database.
 */
import { NextRequest } from "next/server";

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    rFQ: { findUnique: jest.fn() },
    aiConfig: { findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/agent/draft-quotation-email", () => ({
  draftQuotationEmailWithGemini: jest.fn(),
}));
jest.mock("@/lib/rate-limit", () => {
  const actual = jest.requireActual("@/lib/rate-limit");
  return { ...actual, checkAiRouteLimit: jest.fn(() => ({ allowed: true })) };
});

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { draftQuotationEmailWithGemini } from "@/lib/agent/draft-quotation-email";
import { checkAiRouteLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/rfq/[id]/agent/draft-quotation-email/route";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedFindUnique = prisma.rFQ.findUnique as jest.Mock;
const mockedAiConfigFind = prisma.aiConfig.findFirst as jest.Mock;
const mockedDraft = draftQuotationEmailWithGemini as jest.Mock;
const mockedRateLimit = checkAiRouteLimit as jest.Mock;

function postRequest() {
  return new NextRequest("http://localhost/api/rfq/r1/agent/draft-quotation-email", { method: "POST" });
}

const sampleRfq = {
  id: "r1",
  rfqCode: "AC0084",
  incoTerm: "DDP",
  paymentTerm: "30 Days Net",
  totalRevenueUsd: 1000,
  client: { name: "John", companyName: "Acme Co" },
  items: [{ lineNo: 1, standardPartNo: null, rawPartNumber: "A23-170", rawDescription: "Insert", qty: 320 }],
};

describe("POST /api/rfq/[id]/agent/draft-quotation-email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRateLimit.mockReturnValue({ allowed: true });
    mockedAiConfigFind.mockResolvedValue(null);
  });

  it("401s with no session, before touching the database", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(), { params: { id: "r1" } });
    expect(res.status).toBe(401);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("429s when the AI rate limit is exceeded, before touching the database", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await POST(postRequest(), { params: { id: "r1" } });
    expect(res.status).toBe(429);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("404s an unknown RFQ", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest(), { params: { id: "missing" } });
    expect(res.status).toBe(404);
    expect(mockedDraft).not.toHaveBeenCalled();
  });

  it("drafts using the RFQ's own data and the admin-configured Gemini key/model", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedFindUnique.mockResolvedValue(sampleRfq);
    mockedAiConfigFind.mockResolvedValue({ apiKey: "admin-key", modelName: "gemini-admin-model" });
    mockedDraft.mockResolvedValue({ subject: "Quotation AC0084", bodyHtml: "<p>Dear John</p>" });

    const res = await POST(postRequest(), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, subject: "Quotation AC0084", bodyHtml: "<p>Dear John</p>" });

    expect(mockedDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        rfqCode: "AC0084",
        clientName: "John",
        companyName: "Acme Co",
        items: [{ partNumber: "A23-170", description: "Insert", qty: 320 }],
      }),
      { apiKey: "admin-key", modelName: "gemini-admin-model" }
    );
  });

  it("500s with a friendly message when Gemini fails, without throwing raw internals to the client", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedFindUnique.mockResolvedValue(sampleRfq);
    mockedDraft.mockRejectedValue(new Error("Gemini trả về JSON không hợp lệ: garbage"));

    const res = await POST(postRequest(), { params: { id: "r1" } });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("JSON không hợp lệ");
  });
});
