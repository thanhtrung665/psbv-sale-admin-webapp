import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import type { ParsedCiplData } from "@/lib/gemini-cipl";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rfqId, data, fileName } = body as {
      rfqId: string;
      data: ParsedCiplData;
      fileName?: string;
    };

    if (!rfqId) {
      return NextResponse.json(
        { success: false, error: "rfqId is required." },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "CIPL data is required." },
        { status: 400 }
      );
    }

    // Verify RFQ exists
    const rfq = await prisma.rFQ.findUnique({ where: { id: rfqId } });
    if (!rfq) {
      return NextResponse.json(
        { success: false, error: `RFQ with id "${rfqId}" not found.` },
        { status: 404 }
      );
    }

    // Upsert CiplRecord (create new record each time — keep history)
    const ciplRecord = await prisma.ciplRecord.create({
      data: {
        rfqId,
        invoiceNo: data.invoice_no || null,
        invoiceDate: data.invoice_date || null,
        poNo: data.po_no || null,
        poDate: data.po_date || null,
        incoterm: data.incoterm || null,
        mot: data.mot || null,
        pol: data.pol || null,
        pod: data.pod || null,
        consigneeName: data.consignee_name || null,
        consigneeAddress: data.consignee_address || null,
        consigneeAttn: data.consignee_attn || null,
        consigneeEmail: data.consignee_email || null,
        consigneeTel: data.consignee_tel || null,
        totalAmount: data.total_amount || null,
        totalWeightLbs: data.total_weight_lbs || null,
        numberOfBox: data.number_of_box || null,
        boxDimension: data.box_dimension || null,
        shippingMark: data.shipping_mark_product || null,
        sourceFileUrl: fileName || null,
        items: {
          create: (data.items || []).map((item, idx) => ({
            lineNo: idx + 1,
            partNo: item.part_no || "",
            description: item.description || null,
            hsCode: item.hs_code || null,
            quantity: item.quantity || null,
            countryOrigin: item.country_origin || null,
            uom: item.uom || null,
            unitPrice: item.unit_price || null,
            extPrice: item.ext_price || null,
            batchNo: item.batch_no || null,
            netWeight: item.net_weight || null,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({
      success: true,
      ciplRecordId: ciplRecord.id,
      rfqId,
      itemCount: ciplRecord.items.length,
    });
  } catch (error: any) {
    console.error("[CIPL SAVE ERROR]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save CIPL data." },
      { status: 500 }
    );
  }
}
