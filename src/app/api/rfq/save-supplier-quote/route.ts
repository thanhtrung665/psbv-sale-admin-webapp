import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveSupplierQuoteSchema } from "@/lib/schemas";
import { validateBody } from "@/lib/validation";

/**
 * POST /api/rfq/save-supplier-quote
 *
 * Saves extracted supplier quote rows into the DB after user review.
 * Mirrors the logic of /api/rfq/save-parsed-quote but accepts the
 * response shape from /api/rfq/parse-supplier-quote.
 *
 * Body: {
 *   rfqCode: string,
 *   rfqId?: string,                         — Preferred over rfqCode lookup
 *   supplierQuoteCode?: string,
 *   supplierName?: string,
 *   rows: {
 *     lineNo: number;
 *     partNumber: string;
 *     description: string;
 *     qty: number;
 *     unitPrice: number;
 *     netWeightLbs: number;
 *     leadtime: string;
 *     rfqItemId: string | null;
 *   }[]
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bodyCheck = await validateBody(req, saveSupplierQuoteSchema);
    if (!bodyCheck.success) return bodyCheck.response;
    const { rfqCode, rfqId: bodyRfqId, supplierQuoteCode, supplierName, rows } = bodyCheck.data;

    // ── Resolve the RFQ ────────────────────────────────────────────────────
    const rfq = await prisma.rFQ.findUnique({
      where: bodyRfqId ? { id: bodyRfqId } : { rfqCode: rfqCode! },
      include: { items: true },
    });

    if (!rfq) {
      return NextResponse.json(
        { success: false, message: "Đơn hàng không tồn tại." },
        { status: 404 }
      );
    }

    // ── Build Prisma transaction ───────────────────────────────────────────
    const ops: any[] = [];

    for (const row of rows) {
      if (row.rfqItemId) {
        // Update matched existing RFQItem
        ops.push(
          prisma.rFQItem.update({
            where: { id: row.rfqItemId },
            data: {
              supplierDescription: row.description || undefined,
              supplierUnitPrice: row.unitPrice,
              supplierExtPrice: row.unitPrice * row.qty,
              netWeightLbs: row.netWeightLbs || undefined,
              extWeightLbs: row.netWeightLbs ? row.netWeightLbs * row.qty : undefined,
            },
          })
        );
      } else {
        // Create new RFQItem for unmatched lines (extra items from supplier quote)
        ops.push(
          prisma.rFQItem.create({
            data: {
              rfqId: rfq.id,
              lineNo: row.lineNo,
              rawPartNumber: row.partNumber || "",
              rawDescription: row.description,
              supplierDescription: row.description,
              supplierUnitPrice: row.unitPrice,
              supplierExtPrice: row.unitPrice * row.qty,
              netWeightLbs: row.netWeightLbs || 0,
              extWeightLbs: row.netWeightLbs ? row.netWeightLbs * row.qty : 0,
              qty: row.qty,
              uom: "PCS",
            },
          })
        );
      }
    }

    // Advance RFQ status → CBU_PENDING_ADMIN (supplier quote received & parsed)
    ops.push(
      prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          supplierQuoteCode: supplierQuoteCode || rfq.supplierQuoteCode || undefined,
          supplierName: supplierName || rfq.supplierName || undefined,
          status: "CBU_PENDING_ADMIN",
        },
      })
    );

    await prisma.$transaction(ops);

    return NextResponse.json({
      success: true,
      rfqId: rfq.id,
      rfqCode: rfq.rfqCode,
      message: "Lưu báo giá Hãng thành công! Trạng thái RFQ đã cập nhật → Chờ tính CBU.",
    });
  } catch (err: any) {
    console.error("[save-supplier-quote]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra khi lưu." },
      { status: 500 }
    );
  }
}
