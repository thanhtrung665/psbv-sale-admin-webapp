import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCustomerPoWithGemini } from "@/lib/gemini-po";
import { checkAiRouteLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/rfq/parse-customer-po
 *
 * Accepts multipart/form-data with:
 *   - files: File | File[]   — PDF/XLSX/CSV customer PO file(s)
 *   - rfqCode: string        — Optional. Link to an existing RFQ for validation.
 *
 * Returns:
 *   {
 *     success: boolean,
 *     rfqId?: string,
 *     rfqCode?: string,
 *     poNumber: string,
 *     customerName: string,
 *     deliveryDate: string,
 *     currency: string,
 *     rows: ExtractedPoRow[],
 *   }
 *
 * Compatible with ProcessFileModal (PoTab) in the frontend.
 */

interface ExtractedPoRow {
  lineNo: number;
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  agreedDdpPrice: number;
  deliveryDate: string;
}

const NORMALIZE = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");

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

    // Support both single `file` key and multi `files` key
    let files: File[] = [];
    const rawFiles = formData.getAll("files");
    const rawFile = formData.get("file");

    if (rawFiles.length > 0) {
      files = rawFiles.filter((f): f is File => f instanceof File);
    } else if (rawFile instanceof File) {
      files = [rawFile];
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, message: "Vui lòng upload ít nhất một file PO (PDF/XLSX/CSV)." },
        { status: 400 }
      );
    }

    // ── Optional: resolve & validate RFQ ──────────────────────────────────
    let rfq: Awaited<ReturnType<typeof prisma.rFQ.findUnique>> | null = null;
    if (rfqCode) {
      rfq = await prisma.rFQ.findUnique({
        where: { rfqCode },
        include: { items: { orderBy: { lineNo: "asc" } } },
      });

      if (!rfq) {
        return NextResponse.json(
          { success: false, message: `Mã đơn hàng "${rfqCode}" không tồn tại trong hệ thống.` },
          { status: 404 }
        );
      }
    }

    // ── Parse all uploaded files with Gemini ──────────────────────────────
    const allRows: ExtractedPoRow[] = [];
    let poNumber = "";
    let customerName = "";
    let deliveryDate = "";
    let currency = "USD";
    let globalLineNo = 1;

    for (const file of files) {
      const mimeType = resolveMimeType(file);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const parsed = await parseCustomerPoWithGemini(fileBuffer, mimeType, file.name);

      // Take header-level metadata from the first file that provides it
      if (!poNumber && parsed.poNumber) poNumber = parsed.poNumber;
      if (!customerName && parsed.customerName) customerName = parsed.customerName;
      if (!deliveryDate && parsed.deliveryDate) deliveryDate = parsed.deliveryDate;
      if (parsed.currency && parsed.currency !== "USD") currency = parsed.currency;

      for (const item of parsed.items) {
        allRows.push({
          lineNo: globalLineNo++,
          partNumber: item.partNumber,
          description: item.description,
          qty: item.qty,
          uom: item.uom,
          agreedDdpPrice: item.agreedDdpPrice,
          deliveryDate: item.deliveryDate || deliveryDate,
        });
      }
    }

    // ── Optional: cross-check item count against RFQ ──────────────────────
    let itemsCrossCheck: {
      partNumber: string;
      rfqItemId: string | null;
      matched: boolean;
    }[] = [];

    if (rfq && "items" in rfq) {
      const dbItems = rfq.items as any[];
      itemsCrossCheck = allRows.map((row) => {
        const dbMatch = dbItems.find(
          (db: any) =>
            NORMALIZE(db.rawPartNumber) === NORMALIZE(row.partNumber) ||
            NORMALIZE(db.standardPartNo || "") === NORMALIZE(row.partNumber)
        );
        return {
          partNumber: row.partNumber,
          rfqItemId: dbMatch ? dbMatch.id : null,
          matched: !!dbMatch,
        };
      });
    }

    return NextResponse.json({
      success: true,
      rfqId: rfq?.id || null,
      rfqCode: rfq?.rfqCode || rfqCode || null,
      poNumber,
      customerName,
      deliveryDate,
      currency,
      rows: allRows,
      crossCheck: itemsCrossCheck.length > 0 ? itemsCrossCheck : null,
    });
  } catch (err: any) {
    console.error("[parse-customer-po]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra khi phân tích file PO." },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":  return "application/pdf";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":  return "application/vnd.ms-excel";
    case "csv":  return "text/csv";
    case "png":  return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default:     return "application/octet-stream";
  }
}
