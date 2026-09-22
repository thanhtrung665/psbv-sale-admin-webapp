/**
 * Integration test for POST /api/tasks — exercises the real route handler with `next-auth` and
 * `@/lib/prisma` mocked. Covers the Zod-wired body validation plus the authorization rule that
 * isn't in the schema at all: a non-ADMIN can only ever create a task assigned to themselves,
 * no matter what assigneeId they send.
 */
import { NextRequest } from "next/server";

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { task: { create: jest.fn(), findMany: jest.fn() } },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/tasks/route";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedCreate = prisma.task.create as jest.Mock;

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401s with no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ title: "Follow up" }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("400s a body with no title", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SALE_ADMIN" } });
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("a SALE_ADMIN's task is always assigned to themselves, even if they send someone else's id", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SALE_ADMIN" } });
    mockedCreate.mockResolvedValue({ id: "t1" });

    await POST(postRequest({ title: "Follow up", assigneeId: "someone-else" }));

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorId: "u1", assigneeId: "u1" }),
    });
  });

  it("an ADMIN can assign a task to another user", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    mockedCreate.mockResolvedValue({ id: "t2" });

    await POST(postRequest({ title: "Review quote", assigneeId: "u2" }));

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorId: "admin1", assigneeId: "u2" }),
    });
  });

  it("an ADMIN with no assigneeId still defaults to themselves", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    mockedCreate.mockResolvedValue({ id: "t3" });

    await POST(postRequest({ title: "Review quote" }));

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorId: "admin1", assigneeId: "admin1" }),
    });
  });

  it("dueDate is parsed to a Date; omitted dueDate stays null", async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SALE_ADMIN" } });
    mockedCreate.mockResolvedValue({ id: "t4" });

    await POST(postRequest({ title: "Follow up", dueDate: "2026-10-01" }));

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ dueDate: new Date("2026-10-01") }),
    });
  });
});
