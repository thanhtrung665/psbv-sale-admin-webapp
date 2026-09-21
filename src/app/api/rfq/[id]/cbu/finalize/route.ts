import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveCbuSchema } from "@/lib/schemas";
import { validateBody, validatePathParam } from "@/lib/validation";
import { cbuErrorResponse } from "@/lib/cbu/db/http";
import { saveCbuSheet } from "@/lib/cbu/db/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/rfq/[id]/cbu/finalize — same body as PUT, plus a gate: every self-check passes and every line is
 * priced and weighed, otherwise 422 with the list of reasons. Success → status QUOTATION_DRAFTED.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = validatePathParam(params.id, "id");
  if (!id.success) return id.response;
  const body = await validateBody(req, saveCbuSchema);
  if (!body.success) return body.response;

  try {
    const outcome = await saveCbuSheet(prisma, id.data, body.data, "finalize");
    return NextResponse.json({ message: "Hoàn tất CBU — Tạo Quotation nháp thành công!", ...outcome });
  } catch (err) {
    return cbuErrorResponse(err, "cbu:finalize");
  }
}
