import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRfoId } from "@/lib/rfq-code";
import { createRfqManualSchema } from "@/lib/schemas";
import { validateBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bodyCheck = await validateBody(req, createRfqManualSchema);
    if (!bodyCheck.success) return bodyCheck.response;
    const {
      clientName, clientEmail, companyName, clientPhone,
      opportunityName, supplierName, incoTerm, paymentTerm,
      items, rfqCode: providedRfqCode,
    } = bodyCheck.data;
    const createdById = (session.user as any).id as string;

    let rfqCode = providedRfqCode?.trim();
    if (rfqCode) {
      const existing = await prisma.rFQ.findUnique({ where: { rfqCode } });
      if (existing) {
        return NextResponse.json({ error: `Mã Inquiry ${rfqCode} đã tồn tại.` }, { status: 400 });
      }
    } else {
      rfqCode = await generateRfoId();
    }

    // Upsert client
    const client = await prisma.client.upsert({
      where: { email: clientEmail },
      update: { name: clientName, companyName: companyName ?? undefined, phone: clientPhone },
      create: { name: clientName, companyName: companyName || "", email: clientEmail, phone: clientPhone },
    });

    // Create RFQ with items — skip AI, status goes straight to RFO_PENDING_ADMIN
    const rfq = await prisma.rFQ.create({
      data: {
        rfqCode,
        clientId: client.id,
        status: "RFO_PENDING_ADMIN",
        isProcessing: false,
        createdById,
        opportunityName: opportunityName || null,
        supplierName: supplierName || null,
        incoTerm: incoTerm || null,
        paymentTerm: paymentTerm || null,
        items: {
          create: items.map((item: any, idx: number) => ({
            lineNo: item.lineNo || idx + 1,
            rawPartNumber: item.rawPartNumber || "",
            rawDescription: item.rawDescription || "",
            qty: Number(item.qty) || 1,
            uom: item.uom || "PCS",
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ rfqId: rfq.id, rfqCode }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra." }, { status: 500 });
  }
}
