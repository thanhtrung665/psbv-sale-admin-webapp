import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftQuotationEmailWithGemini } from "@/lib/agent/draft-quotation-email";
import { checkAiRouteLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/rfq/[id]/agent/draft-quotation-email — Email Review Agent v1 (SPEC.md §13).
 * Drafts a subject/body for the Quotation email using Gemini. Read-only: does not send email, does not write
 * to the database. The caller (quote-preview page) always shows the draft to a human to edit before sending
 * through the real send-quote route.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const rl = checkAiRouteLimit(userId);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

  try {
    const rfq = await prisma.rFQ.findUnique({
      where: { id: params.id },
      include: { client: true, items: { orderBy: { lineNo: "asc" } } },
    });
    if (!rfq) return NextResponse.json({ error: "Không tìm thấy RFQ" }, { status: 404 });

    const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });

    const draft = await draftQuotationEmailWithGemini(
      {
        rfqCode: rfq.rfqCode,
        clientName: rfq.client?.name || "",
        companyName: rfq.client?.companyName || "",
        incoTerm: rfq.incoTerm,
        paymentTerm: rfq.paymentTerm,
        totalRevenueUsd: rfq.totalRevenueUsd || 0,
        items: rfq.items.map((i) => ({
          partNumber: i.standardPartNo || i.rawPartNumber,
          description: i.rawDescription || "",
          qty: i.qty,
        })),
      },
      { apiKey: config?.apiKey, modelName: config?.modelName }
    );

    return NextResponse.json({ success: true, ...draft });
  } catch (error: any) {
    console.error("[agent/draft-quotation-email] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Không soạn được nháp email." },
      { status: 500 }
    );
  }
}
