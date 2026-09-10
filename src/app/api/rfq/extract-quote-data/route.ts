import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSupplierQuoteWithGemini } from "@/lib/gemini-quote";

export const runtime = "nodejs";
export const maxDuration = 90; // Increased timeout for AI parsing

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rfqCode: string | null = null;
  let file: File | null = null;

  try {
    const formData = await req.formData();
    rfqCode = formData.get("rfqCode") as string | null;
    file = formData.get("file") as File | null;

    // ── Validation ───────────────────────────────────────────────────────
    if (!rfqCode || !rfqCode.trim()) {
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

    // Validate file type
    const validTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    if (file.type && !validTypes.includes(file.type)) {
      console.warn("[extract-quote-data] Unexpected file type:", file.type);
    }

    // ── Find RFQ ────────────────────────────────────────────────────────
    const rfq = await prisma.rFQ.findUnique({
      where: { rfqCode: rfqCode.trim() },
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

    // ── Parse with Gemini ───────────────────────────────────────────────
    console.log(`[extract-quote-data] Processing file: ${file.name} (${file.size} bytes)`);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSupplierQuoteWithGemini(fileBuffer, file.type, file.name);

    // Validate parsed result
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error("AI trả về dữ liệu không hợp lệ. Vui lòng thử lại với file khác.");
    }

    console.log(`[extract-quote-data] Parsed ${parsed.items.length} items from Gemini`);

    // ── Match items ────────────────────────────────────────────────────
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

    // Include unmatched extracted items
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
      totalItems: mergedItems.length + extraItems.length,
    });
  } catch (err: any) {
    console.error("[extract-quote-data] Error:", err);

    // Determine specific error message
    let errorMessage = "❌ Không thể bóc tách file, vui lòng thử lại.";

    if (err.message?.includes("JSON không hợp lệ")) {
      errorMessage = "❌ File không đọc được. Vui lòng thử file khác hoặc định dạng khác (PDF, Excel).";
    } else if (err.message?.includes("quota") || err.message?.includes("rate limit")) {
      errorMessage = "❌ AI đang bận. Vui lòng chờ vài giây rồi thử lại.";
    } else if (err.message?.includes("invalid") || err.message?.includes("Invalid")) {
      errorMessage = "❌ API key không hợp lệ. Vui lòng kiểm tra cấu hình AI.";
    } else if (err.message) {
      // Truncate long error messages
      errorMessage = `❌ ${err.message.substring(0, 100)}${err.message.length > 100 ? "..." : ""}`;
    }

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}
