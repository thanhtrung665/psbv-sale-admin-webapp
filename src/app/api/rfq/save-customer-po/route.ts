import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveCustomerPoSchema } from "@/lib/schemas";
import { validateBody } from "@/lib/validation";

/**
 * POST /api/rfq/save-customer-po
 *
 * Saves the reviewed PO extraction result into the DB and updates the RFQ.
 *
 * Body: {
 *   rfqCode?: string,
 *   rfqId?: string,
 *   poNumber: string,
 *   customerName?: string,
 *   deliveryDate?: string,
 *   currency?: string,
 *   rows: {
 *     lineNo: number;
 *     partNumber: string;
 *     description: string;
 *     qty: number;
 *     uom: string;
 *     agreedDdpPrice: number;
 *     deliveryDate: string;
 *   }[]
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bodyCheck = await validateBody(req, saveCustomerPoSchema);
    if (!bodyCheck.success) return bodyCheck.response;
    const { rfqCode, rfqId: bodyRfqId, poNumber, rows } = bodyCheck.data;

    // ── Resolve the RFQ ────────────────────────────────────────────────────
    const rfq = await prisma.rFQ.findUnique({
      where: bodyRfqId ? { id: bodyRfqId } : { rfqCode: rfqCode! },
      include: { items: { orderBy: { lineNo: "asc" } } },
    });

    if (!rfq) {
      return NextResponse.json(
        { success: false, message: "Đơn hàng không tồn tại." },
        { status: 404 }
      );
    }

    const NORMALIZE = (s: string) => s.toUpperCase().replace(/[\s\-\.]/g, "");

    // ── Build Prisma transaction ───────────────────────────────────────────
    const ops: any[] = [];

    for (const row of rows) {
      // Match against existing RFQ items by part number
      const dbItems = rfq.items as any[];
      const rowPartNumber = row.partNumber || "";
      const dbMatch = dbItems.find(
        (db: any) =>
          NORMALIZE(db.rawPartNumber) === NORMALIZE(rowPartNumber) ||
          NORMALIZE(db.standardPartNo || "") === NORMALIZE(rowPartNumber)
      );

      if (dbMatch) {
        // Update agreed DDP price on existing RFQItem
        ops.push(
          prisma.rFQItem.update({
            where: { id: dbMatch.id },
            data: {
              qty: row.qty,
              uom: row.uom || dbMatch.uom || "PCS",
              ddpPriceUsd: (row.agreedDdpPrice ?? 0) > 0 ? row.agreedDdpPrice : undefined,
            },
          })
        );
      }
      // NOTE: We intentionally do NOT create new items from PO —
      // the RFQ item list is the source of truth for what was inquired.
    }

    // Store the Customer PO reference on the RFQ.
    // `supplierQuoteCode` is repurposed as PO note field until schema adds `customerPoNumber`.
    ops.push(
      prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          opportunityName: rfq.opportunityName
            ? rfq.opportunityName
            : poNumber
            ? `PO: ${poNumber}`
            : undefined,
          // Advance status to QUOTED_TO_CLIENT to reflect that customer has committed
          status: "QUOTED_TO_CLIENT",
        },
      })
    );

    // Log the PO file as a Document record for traceability
    ops.push(
      prisma.document.create({
        data: {
          rfqId: rfq.id,
          type: "CUSTOMER_PO",
          fileUrl: `po:${poNumber || "UNKNOWN"}`,
        },
      })
    );

    await prisma.$transaction(ops);

    return NextResponse.json({
      success: true,
      rfqId: rfq.id,
      rfqCode: rfq.rfqCode,
      message: `Lưu PO Khách "${poNumber}" thành công! Trạng thái RFQ đã cập nhật → Đã gửi Khách.`,
    });
  } catch (err: any) {
    console.error("[save-customer-po]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra khi lưu PO." },
      { status: 500 }
    );
  }
}
