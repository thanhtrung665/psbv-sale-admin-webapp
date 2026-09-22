import { NextRequest, NextResponse } from "next/server";
import { extractCiplFromPdf } from "@/lib/gemini-cipl";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkAiRouteLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkAiRouteLimit((session.user as any).id as string);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rfqId = formData.get("rfqId") as string | null;
    const rfqCode = formData.get("rfqCode") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "Only PDF files are supported for CIPL extraction." },
        { status: 400 }
      );
    }

    // Resolve rfqId from rfqCode if only rfqCode is provided
    let resolvedRfqId = rfqId;
    if (!resolvedRfqId && rfqCode) {
      const rfq = await prisma.rFQ.findUnique({ where: { rfqCode: rfqCode.trim() } });
      if (rfq) resolvedRfqId = rfq.id;
    }

    console.log(`[CIPL EXTRACT] Processing: ${file.name} (${file.size} bytes), rfqId=${resolvedRfqId}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use API key from DB config if available, fallback to env
    let apiKey = process.env.GEMINI_API_KEY || "";
    try {
      const config = await prisma.aiConfig.findFirst();
      if (config?.apiKey) apiKey = config.apiKey;
    } catch {
      // fallback to env key
    }

    const parsed = await extractCiplFromPdf(buffer, apiKey);

    return NextResponse.json({
      success: true,
      rfqId: resolvedRfqId,
      data: parsed,
      fileName: file.name,
    });
  } catch (error: any) {
    console.error("[CIPL EXTRACT ERROR]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Extraction failed." },
      { status: 500 }
    );
  }
}
