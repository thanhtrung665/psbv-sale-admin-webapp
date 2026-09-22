/**
 * Integration test for POST /api/clients — exercises the real route handler (not just the Zod
 * schema in isolation) with `next-auth` and `@/lib/prisma` mocked, so it proves the route actually
 * wires validateBody(createClientSchema) into the request path and rejects what the schema rejects.
 */
import { NextRequest } from "next/server";

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    client: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/clients/route";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedFindUnique = prisma.client.findUnique as jest.Mock;
const mockedCreate = prisma.client.create as jest.Mock;

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/clients", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401s with no session, before touching the database", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ name: "A", companyName: "A Co", email: "a@a.com" }));
    expect(res.status).toBe(401);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("400s a body missing required fields, with the Zod field path in the response", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(postRequest({ name: "A" })); // missing companyName, email
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.errors ?? json.details ?? json.issues ?? []).map((e: any) => e.field ?? e.path?.join("."));
    expect(fields).toEqual(expect.arrayContaining([expect.stringContaining("companyName")]));
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("400s an invalid email", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(postRequest({ name: "A", companyName: "A Co", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email without creating a second client", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedFindUnique.mockResolvedValue({ id: "existing", email: "a@a.com" });
    const res = await POST(postRequest({ name: "A", companyName: "A Co", email: "a@a.com" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("creates the client with exactly the validated fields on a well-formed body", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockedFindUnique.mockResolvedValue(null);
    mockedCreate.mockResolvedValue({ id: "c1", name: "A", companyName: "A Co", email: "a@a.com", phone: null, address: null });

    const res = await POST(postRequest({ name: "A", companyName: "A Co", email: "a@a.com" }));
    expect(res.status).toBe(200);
    expect(mockedCreate).toHaveBeenCalledWith({
      data: { name: "A", companyName: "A Co", email: "a@a.com", phone: null, address: null },
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("c1");
  });
});
