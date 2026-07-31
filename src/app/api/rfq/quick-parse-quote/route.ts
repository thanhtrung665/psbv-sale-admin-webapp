import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSupplierQuoteWithGemini } from "@/lib/gemini-quote";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const rfqCode = formData.get("rfqCode") as string | null;
    const file = formData.get("file") as File | null;

    if (!rfqCode) {
      return NextResponse.json({ success: false, message: "Vui lòng cung cấp mã RFQ." }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, message: "Vui lòng upload file PDF báo giá hãng." }, { status: 400 });
    }

    // Find the RFQ by Code
    const rfq = await prisma.rFQ.findUnique({
      where: { rfqCode },
      include: { items: true },
    });

    if (!rfq) {
      return NextResponse.json({ success: false, message: "Mã đơn hàng ACxxxx không tồn tại trong hệ thống!" }, { status: 404 });
    }

    // ── Run Gemini parser ──────────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSupplierQuoteWithGemini(fileBuffer, file.type, file.name);

    // ── Match part numbers and prepare updates ─────────────────────────────
    const matchResults: { lineNo: number; matched: boolean }[] = [];
    const itemUpdates = [];

    for (const quoteItem of parsed.items) {
      const normalize = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");
      const match = rfq.items.find(
        (ri) =>
          normalize(ri.rawPartNumber) === normalize(quoteItem.partNumber) ||
          normalize(ri.standardPartNo || "") === normalize(quoteItem.partNumber)
      );

      if (match) {
        itemUpdates.push(
          prisma.rFQItem.update({
            where: { id: match.id },
            data: {
              supplierDescription: quoteItem.description,
              supplierUnitPrice: quoteItem.supplierUnitPrice,
              supplierExtPrice: quoteItem.supplierUnitPrice * match.qty,
              netWeightLbs: quoteItem.netWeightLbs,
              extWeightLbs: quoteItem.extWeightLbs,
            },
          })
        );
        matchResults.push({ lineNo: match.lineNo, matched: true });
      }
    }

    // ── Execute Transaction ───────────────────────────────────────────────
    await prisma.$transaction([
      ...itemUpdates,
      prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          supplierQuoteCode: parsed.supplierQuoteCode,
          supplierName: parsed.supplierName,
          status: "CBU_PENDING_ADMIN", // Skips SUPPLIER_QUOTED and goes straight to CBU_PENDING_ADMIN as requested
        },
      }),
      prisma.document.create({
        data: {
          rfqId: rfq.id,
          type: "SUPPLIER_QUOTE_PDF",
          fileUrl: `uploaded:${file.name}`, // Placeholder for Supabase Storage
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      rfqId: rfq.id,
      rfqCode: rfq.rfqCode,
      message: "Bóc tách báo giá Hãng thành công!",
      itemsMatched: matchResults.filter((r) => r.matched).length,
      itemsTotal: parsed.items.length,
    });
  } catch (err: any) {
    console.error("[quick-parse-quote]", err);
    return NextResponse.json({ success: false, message: err.message || "Có lỗi xảy ra." }, { status: 500 });
  }
}
