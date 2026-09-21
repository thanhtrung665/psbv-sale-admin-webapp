import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveCbuSchema } from "@/lib/schemas";
import { validateBody, validatePathParam } from "@/lib/validation";
import { cbuErrorResponse } from "@/lib/cbu/db/http";
import { loadCbuSheet, saveCbuSheet } from "@/lib/cbu/db/service";

export const dynamic = "force-dynamic";

/** GET /api/rfq/[id]/cbu — stored inputs + a fresh server-side calculation (SPEC §11.8). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = validatePathParam(params.id, "id");
  if (!id.success) return id.response;

  try {
    const sheet = await loadCbuSheet(prisma, id.data);
    return NextResponse.json({ sheet });
  } catch (err) {
    return cbuErrorResponse(err, "cbu:get");
  }
}

/**
 * PUT /api/rfq/[id]/cbu — save a draft. Body = INPUTS only; the server recalculates and ignores any
 * total or per-line result the client may add. Status → CBU_PENDING_ADMIN (a sent quotation is never demoted).
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = validatePathParam(params.id, "id");
  if (!id.success) return id.response;
  const body = await validateBody(req, saveCbuSchema);
  if (!body.success) return body.response;

  try {
    const outcome = await saveCbuSheet(prisma, id.data, body.data, "draft");
    return NextResponse.json({ message: "Đã lưu nháp CBU.", ...outcome });
  } catch (err) {
    return cbuErrorResponse(err, "cbu:put");
  }
}
