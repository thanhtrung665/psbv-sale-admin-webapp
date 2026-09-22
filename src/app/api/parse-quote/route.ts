import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSupplierQuoteWithGemini } from "@/lib/gemini-quote";
import { checkAiRouteLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkAiRouteLimit((session.user as any).id as string);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

  try {
    const formData = await req.formData();
    const rfqCode = (formData.get("rfqCode") as string | null)?.trim() || null;
    // Support both "file" (legacy) and "files" (multiple) keys
    let file = formData.get("file") as File | null;
    if (!file) {
      const rawFiles = formData.getAll("files");
      if (rawFiles.length > 0 && rawFiles[0] instanceof File) {
        file = rawFiles[0] as File;
      }
    }
    if (!file) {
      return NextResponse.json({ success: false, error: "Không tìm thấy file đính kèm." }, { status: 400 });
    }

    // Optional RFQ lookup for part matching
    let rfq = null;
    if (rfqCode) {
      rfq = await prisma.rFQ.findUnique({
        where: { rfqCode },
        include: { items: { orderBy: { lineNo: "asc" } } },
      });
      if (!rfq) {
        return NextResponse.json({ success: false, error: `Mã RFQ \"${rfqCode}\" không tồn tại.` }, { status: 404 });
      }
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSupplierQuoteWithGemini(fileBuffer, file.type, file.name);

    const normalize = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");
    // Build rows, matching against RFQ if present
    const rows = parsed.items.map((item, idx) => {
      let rfqItemId: string | null = null;
      let matched = false;
      if (rfq && rfq.items) {
        const dbMatch = rfq.items.find(
          (db: any) =>
            normalize(db.rawPartNumber) === normalize(item.partNumber) ||
            normalize(db.standardPartNo || "") === normalize(item.partNumber)
        );
        if (dbMatch) {
          rfqItemId = dbMatch.id;
          matched = true;
        }
      }
      return {
        lineNo: idx + 1,
        partNumber: item.partNumber,
        brand: "",
        description: item.description,
        qty: 1,
        uom: "PCS",
        unitPrice: item.supplierUnitPrice,
        leadtime: item.leadTime || "",
        netWeightLbs: item.netWeightLbs || 0,
        rfqItemId,
        matched,
      };
    });

    return NextResponse.json({ success: true, rows, message: "Bóc tách thành công" });
  } catch (error: any) {
    console.error("[PARSE_QUOTE_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
