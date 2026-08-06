import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rfqId, rfqCode, supplierQuoteCode, items } = body as {
      rfqId: string;
      rfqCode: string;
      supplierQuoteCode: string;
      items: {
        id: string;
        lineNo: number;
        rawPartNumber: string;
        rawDescription: string;
        supplierUnitPrice: number;
        netWeightLbs: number;
        uom: string;
        qty: number;
      }[];
    };

    if (!rfqId || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Thiếu rfqId hoặc danh sách items." },
        { status: 400 }
      );
    }

    // Verify RFQ exists
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true },
    });

    if (!rfq) {
      return NextResponse.json(
        { success: false, message: "Đơn hàng không tồn tại." },
        { status: 404 }
      );
    }

    // ── Build transaction operations ──────────────────────────────────────
    const operations: any[] = [];

    // Update existing items
    for (const item of items) {
      if (item.id.startsWith("new-")) {
        // Create new RFQItem for unmatched extracted items
        operations.push(
          prisma.rFQItem.create({
            data: {
              rfqId,
              lineNo: item.lineNo,
              rawPartNumber: item.rawPartNumber,
              rawDescription: item.rawDescription,
              supplierUnitPrice: item.supplierUnitPrice,
              supplierExtPrice: item.supplierUnitPrice * item.qty,
              netWeightLbs: item.netWeightLbs,
              extWeightLbs: item.netWeightLbs * item.qty,
              uom: item.uom,
              qty: item.qty,
            },
          })
        );
      } else {
        // Update existing RFQItem
        operations.push(
          prisma.rFQItem.update({
            where: { id: item.id },
            data: {
              rawPartNumber: item.rawPartNumber,
              rawDescription: item.rawDescription,
              supplierUnitPrice: item.supplierUnitPrice,
              supplierExtPrice: item.supplierUnitPrice * item.qty,
              netWeightLbs: item.netWeightLbs,
              extWeightLbs: item.netWeightLbs * item.qty,
              uom: item.uom,
            },
          })
        );
      }
    }

    // Update RFQ status
    operations.push(
      prisma.rFQ.update({
        where: { id: rfqId },
        data: {
          supplierQuoteCode: supplierQuoteCode || rfq.supplierQuoteCode,
          status: "CBU_PENDING_ADMIN",
        },
      })
    );

    // ── Execute transaction ───────────────────────────────────────────────
    await prisma.$transaction(operations);

    return NextResponse.json({
      success: true,
      rfqId,
      rfqCode,
      message: "Lưu dữ liệu báo giá hãng thành công!",
    });
  } catch (err: any) {
    console.error("[save-parsed-quote]", err);
    return NextResponse.json(
      { success: false, message: err.message || "Có lỗi xảy ra." },
      { status: 500 }
    );
  }
}
