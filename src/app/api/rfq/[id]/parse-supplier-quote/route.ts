import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSupplierQuoteWithGemini } from "@/lib/gemini-quote";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Vui lòng upload file PDF báo giá hãng." }, { status: 400 });
    }

    const rfqId = params.id;

    // Fetch existing RFQ with items
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true },
    });
    if (!rfq) return NextResponse.json({ error: "Không tìm thấy RFQ." }, { status: 404 });

    // ── Run Gemini parser ──────────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSupplierQuoteWithGemini(fileBuffer, file.type, file.name);

    // ── Match part numbers and update RFQItems ─────────────────────────────
    const matchResults: { lineNo: number; matched: boolean }[] = [];

    for (const quoteItem of parsed.items) {
      // Fuzzy match: normalize both to uppercase and strip spaces
      const normalize = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");
      const match = rfq.items.find(
        (ri) =>
          normalize(ri.rawPartNumber) === normalize(quoteItem.partNumber) ||
          normalize(ri.standardPartNo || "") === normalize(quoteItem.partNumber)
      );

      if (match) {
        await prisma.rFQItem.update({
          where: { id: match.id },
          data: {
            supplierUnitPrice: quoteItem.supplierUnitPrice,
            supplierExtPrice: quoteItem.supplierUnitPrice * match.qty,
            netWeightLbs: quoteItem.netWeightLbs,
          },
        });
        matchResults.push({ lineNo: match.lineNo, matched: true });
      }
    }

    // ── Update RFQ header + status ─────────────────────────────────────────
    await prisma.rFQ.update({
      where: { id: rfqId },
      data: {
        supplierQuoteCode: parsed.supplierQuoteCode,
        supplierName: parsed.supplierName,
        status: "CBU_PENDING_ADMIN", // Skip SUPPLIER_QUOTED → go straight to CBU
      },
    });

    // ── Save document record ───────────────────────────────────────────────
    await prisma.document.create({
      data: {
        rfqId,
        type: "SUPPLIER_QUOTE_PDF",
        fileUrl: `uploaded:${file.name}`, // Storage integration in next sprint
      },
    });

    return NextResponse.json({
      success: true,
      message: "Bóc tách báo giá Hãng thành công!",
      supplierQuoteCode: parsed.supplierQuoteCode,
      supplierName: parsed.supplierName,
      itemsMatched: matchResults.filter((r) => r.matched).length,
      itemsTotal: parsed.items.length,
      parsedData: parsed.items,
    });
  } catch (err: any) {
    console.error("[parse-supplier-quote]", err);
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra." }, { status: 500 });
  }
}
