import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRfoId } from "@/lib/rfq-code";
import { parseInquiryWithGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const emailText = formData.get("emailText") as string | null;
    const createdById = (session.user as any).id as string;

    if (!file && !emailText) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp file hoặc nội dung email." },
        { status: 400 }
      );
    }

    // ── 1. Generate RFQ Code ────────────────────────────────────────────────
    const rfqCode = await generateRfoId();

    // ── 2. Create a placeholder RFQ immediately (isProcessing = true) ────────
    const rfq = await prisma.rFQ.create({
      data: {
        rfqCode,
        status: "INQUIRY_RECEIVED",
        isProcessing: true,
        createdById,
        // Temporary placeholder client — will be updated after AI parse
        client: {
          connectOrCreate: {
            where: { email: `pending_${rfqCode}@placeholder.com` },
            create: {
              name: "Đang xử lý...",
              companyName: "Đang xử lý...",
              email: `pending_${rfqCode}@placeholder.com`,
            },
          },
        },
      },
    });

    // ── 3. Run Gemini Parser synchronously ──────────
    try {
      let parsed;

      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        parsed = await parseInquiryWithGemini(buffer, file.type);
      } else {
        parsed = await parseInquiryWithGemini(undefined, undefined, emailText!);
      }

      // Upsert the real client
      const client = await prisma.client.upsert({
        where: { email: parsed.clientEmail || `pending_${rfqCode}@placeholder.com` },
        update: {
          name: parsed.clientName,
          companyName: parsed.companyName,
          phone: parsed.clientPhone,
        },
        create: {
          name: parsed.clientName || "Unknown",
          companyName: parsed.companyName || "Unknown",
          email: parsed.clientEmail || `${rfqCode}@unknown.com`,
          phone: parsed.clientPhone,
        },
      });

      // Update RFQ with real client and items
      await prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          clientId: client.id,
          status: "RFO_PENDING_ADMIN",
          isProcessing: false,
          extractionError: null,
          items: {
            create: parsed.items.map((item) => ({
              lineNo: item.lineNo,
              rawPartNumber: item.rawPartNumber,
              rawDescription: item.rawDescription,
              standardPartNo: item.standardPartNo,
              qty: item.qty,
              uom: item.uom,
              supplier: item.supplier,
            })),
          },
        },
      });

      // Remove placeholder client if different
      if (client.email !== `pending_${rfqCode}@placeholder.com`) {
        await prisma.client.deleteMany({
          where: { email: `pending_${rfqCode}@placeholder.com` },
        });
      }

      return NextResponse.json(
        { rfqId: rfq.id, rfqCode, message: "Bóc tách AI thành công." },
        { status: 200 }
      );
    } catch (err: any) {
      await prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          isProcessing: false,
          extractionError: err.message || "AI parsing failed",
        },
      });

      return NextResponse.json(
        { rfqId: rfq.id, rfqCode, error: err.message || "AI parsing failed, but RFQ created." },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Có lỗi xảy ra." },
      { status: 500 }
    );
  }
}
