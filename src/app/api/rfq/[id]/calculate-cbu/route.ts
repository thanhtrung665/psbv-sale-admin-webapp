import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { legacyCalculateCbuSchema, saveCbuSchema } from "@/lib/schemas";
import { createValidationErrorResponse, validateBody, validatePathParam } from "@/lib/validation";
import { cbuErrorResponse } from "@/lib/cbu/db/http";
import { legacyBodyToSaveInput } from "@/lib/cbu/db/legacy-body";
import { saveCbuSheet } from "@/lib/cbu/db/service";

export const dynamic = "force-dynamic";

/**
 * DEPRECATED alias (SPEC §11.8) kept for the pre-v2 cbu-calc page until phase C3/C5.
 *
 * The old page still posts the results it computed in the browser (`items[*].ddpPriceUsd`, `totalRevenueUsd`, …).
 * They are ignored: only the inputs are read, re-validated, and the SERVER recalculates and persists.
 * Prefer PUT /api/rfq/[id]/cbu and POST /api/rfq/[id]/cbu/finalize.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = validatePathParam(params.id, "id");
  if (!id.success) return id.response;
  const body = await validateBody(req, legacyCalculateCbuSchema);
  if (!body.success) return body.response;

  const converted = saveCbuSchema.safeParse(legacyBodyToSaveInput(body.data));
  if (!converted.success) return createValidationErrorResponse(converted.error);

  try {
    const action = body.data.finalize === true ? "finalize" : "draft";
    const outcome = await saveCbuSheet(prisma, id.data, converted.data, action);
    return NextResponse.json({
      message: action === "finalize" ? "Hoàn tất CBU — Tạo Quotation nháp thành công!" : "Đã lưu nháp CBU.",
      status: outcome.statusChange.to,
      ...outcome,
    });
  } catch (err) {
    return cbuErrorResponse(err, "calculate-cbu", { flattenDetails: true });
  }
}
