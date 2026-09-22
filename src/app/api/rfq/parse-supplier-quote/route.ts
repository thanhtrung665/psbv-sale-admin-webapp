import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSupplierQuoteWithGemini } from "@/lib/gemini-quote";
import { checkAiRouteLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/rfq/parse-supplier-quote
 *
 * Accepts multipart/form-data with:
 *   - files: File | File[]   — PDF/XLSX/CSV supplier quote file(s)
 *   - rfqCode: string        — Optional. Link to an existing RFQ for part-matching.
 *
 * Returns:
 *   {
 *     success: boolean,
 *     rfqId?: string,
 *     rfqCode?: string,
 *     supplierQuoteCode?: string,
 *     supplierName?: string,
 *     rows: ExtractedQuoteRow[],
 *     matchSummary?: { matched: number; total: number }
 *   }
 *
 * Compatible with ProcessFileModal (QuoteTab) in the frontend.
 */

interface ExtractedQuoteRow {
  lineNo: number;
  partNumber: string;
  description: string;
  qty: number;
  unitPrice: number;
  leadtime: string;
  netWeightLbs: number;
  /** DB item id if matched to an existing RFQ item, else null */
  rfqItemId: string | null;
  matched: boolean;
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

    // Support both single `file` key (legacy) and multi `files` key (new modal)
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
        { success: false, message: "Vui lòng upload ít nhất một file báo giá hãng (PDF/XLSX/CSV)." },
        { status: 400 }
      );
    }

    // ── Optional: resolve RFQ for part-matching ────────────────────────────
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
    const allParsedItems: ExtractedQuoteRow[] = [];
    let supplierQuoteCode = "";
    let supplierName = "";
    let globalLineNo = 1;

    for (const file of files) {
      const mimeType = resolveMimeType(file);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const parsed = await parseSupplierQuoteWithGemini(fileBuffer, mimeType, file.name);

      if (!supplierQuoteCode && parsed.supplierQuoteCode) supplierQuoteCode = parsed.supplierQuoteCode;
      if (!supplierName && parsed.supplierName) supplierName = parsed.supplierName;

      for (const item of parsed.items) {
        // ── Part-number matching against RFQ items ─────────────────────────
        let rfqItemId: string | null = null;
        let matched = false;

        if (rfq && "items" in rfq) {
          const dbItems = rfq.items as any[];
          const dbMatch = dbItems.find(
            (db: any) =>
              NORMALIZE(db.rawPartNumber) === NORMALIZE(item.partNumber) ||
              NORMALIZE(db.standardPartNo || "") === NORMALIZE(item.partNumber)
          );
          if (dbMatch) {
            rfqItemId = dbMatch.id;
            matched = true;
          }
        }

        allParsedItems.push({
          lineNo: globalLineNo++,
          partNumber: item.partNumber,
          description: item.description,
          qty: 1,          // Supplier quotes typically list unit prices; qty comes from the RFQ
          unitPrice: item.supplierUnitPrice,
          leadtime: item.leadTime || "",
          netWeightLbs: item.netWeightLbs || 0,
          rfqItemId,
          matched,
        });
      }
    }

    const matchedCount = allParsedItems.filter((r) => r.matched).length;

    return NextResponse.json({
      success: true,
      rfqId: rfq?.id || null,
      rfqCode: rfq?.rfqCode || rfqCode || null,
      supplierQuoteCode,
      supplierName,
      rows: allParsedItems,
      matchSummary: rfq ? { matched: matchedCount, total: allParsedItems.length } : null,
    });
  } catch (err: any) {
    console.error("[parse-supplier-quote]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra khi bóc tách báo giá hãng." },
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
