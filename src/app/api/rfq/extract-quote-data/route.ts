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
      return NextResponse.json(
        { success: false, message: "Vui lòng cung cấp mã RFQ." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, message: "Vui lòng upload file báo giá hãng." },
        { status: 400 }
      );
    }

    // Find the RFQ by Code
    const rfq = await prisma.rFQ.findUnique({
      where: { rfqCode },
      include: {
        items: { orderBy: { lineNo: "asc" } },
        client: true,
      },
    });

    if (!rfq) {
      return NextResponse.json(
        { success: false, message: `Mã đơn hàng ${rfqCode} không tồn tại!` },
        { status: 404 }
      );
    }

    // ── Run Gemini parser ──────────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSupplierQuoteWithGemini(fileBuffer, file.type, file.name);

    // ── Match extracted items with existing RFQ items ─────────────────────
    const normalize = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");

    const mergedItems = rfq.items.map((dbItem) => {
      const match = parsed.items.find(
        (qi) =>
          normalize(qi.partNumber) === normalize(dbItem.rawPartNumber) ||
          normalize(qi.partNumber) === normalize(dbItem.standardPartNo || "")
      );

      return {
        id: dbItem.id,
        lineNo: dbItem.lineNo,
        rawPartNumber: dbItem.rawPartNumber,
        rawDescription: match?.description || dbItem.rawDescription || "",
        supplierUnitPrice: match?.supplierUnitPrice ?? dbItem.supplierUnitPrice ?? 0,
        netWeightLbs: match?.netWeightLbs ?? dbItem.netWeightLbs ?? 0,
        uom: dbItem.uom || "PCS",
        qty: dbItem.qty,
        matched: !!match,
      };
    });

    // Also include any extracted items that didn't match existing DB items
    const unmatchedExtracted = parsed.items.filter(
      (qi) =>
        !rfq.items.some(
          (dbItem) =>
            normalize(qi.partNumber) === normalize(dbItem.rawPartNumber) ||
            normalize(qi.partNumber) === normalize(dbItem.standardPartNo || "")
        )
    );

    const extraItems = unmatchedExtracted.map((qi, idx) => ({
      id: `new-${idx}`,
      lineNo: rfq.items.length + idx + 1,
      rawPartNumber: qi.partNumber,
      rawDescription: qi.description,
      supplierUnitPrice: qi.supplierUnitPrice,
      netWeightLbs: qi.netWeightLbs,
      uom: "PCS",
      qty: 1,
      matched: false,
    }));

    return NextResponse.json({
      success: true,
      rfqId: rfq.id,
      rfqCode: rfq.rfqCode,
      clientName: rfq.client?.name || "",
      companyName: rfq.client?.companyName || "",
      supplierQuoteCode: parsed.supplierQuoteCode,
      supplierName: parsed.supplierName,
      items: [...mergedItems, ...extraItems],
    });
  } catch (err: any) {
    console.error("[extract-quote-data]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra khi bóc tách." },
      { status: 500 }
    );
  }
}
