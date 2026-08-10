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

    // ── Read header fields from FormData ──────────────────────────────────
    const opportunityName = (formData.get("opportunityName") as string) || null;
    const supplierName = (formData.get("supplierName") as string) || null;
    const clientNameInput = (formData.get("clientName") as string) || "";
    const clientEmailInput = (formData.get("clientEmail") as string) || "";
    const clientPhoneInput = (formData.get("clientPhone") as string) || "";
    const companyNameInput = (formData.get("companyName") as string) || "";
    const incoTerm = (formData.get("incoTerm") as string) || null;
    const paymentTerm = (formData.get("paymentTerm") as string) || null;

    if (!file && !emailText) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp file hoặc nội dung email." },
        { status: 400 }
      );
    }

    // ── 1. Generate RFQ Code ────────────────────────────────────────────────
    let rfqCode = formData.get("rfqCode") as string | null;
    if (rfqCode) {
      rfqCode = rfqCode.trim();
      const existing = await prisma.rFQ.findUnique({ where: { rfqCode } });
      if (existing) {
        return NextResponse.json({ error: `Mã Inquiry ${rfqCode} đã tồn tại.` }, { status: 400 });
      }
    } else {
      rfqCode = await generateRfoId();
    }

    // ── 2. Create a placeholder RFQ immediately (isProcessing = true) ────────
    const rfq = await prisma.rFQ.create({
      data: {
        rfqCode,
        status: "INQUIRY_RECEIVED",
        isProcessing: true,
        createdById,
        opportunityName,
        supplierName,
        incoTerm,
        paymentTerm,
        // Temporary placeholder client — will be updated after AI parse
        client: {
          connectOrCreate: {
            where: { email: clientEmailInput || `pending_${rfqCode}@placeholder.com` },
            create: {
              name: clientNameInput || "Đang xử lý...",
              companyName: companyNameInput || "Đang xử lý...",
              email: clientEmailInput || `pending_${rfqCode}@placeholder.com`,
              phone: clientPhoneInput || null,
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

      // Determine final client values: user-provided takes priority over AI-extracted
      const finalClientName = clientNameInput || parsed.clientName || "Unknown";
      const finalClientEmail = clientEmailInput || parsed.clientEmail || `${rfqCode}@unknown.com`;
      const finalCompanyName = companyNameInput || parsed.companyName || "Unknown";
      const finalClientPhone = clientPhoneInput || parsed.clientPhone || null;

      // Upsert the real client
      const client = await prisma.client.upsert({
        where: { email: finalClientEmail },
        update: {
          name: finalClientName,
          companyName: finalCompanyName,
          phone: finalClientPhone,
        },
        create: {
          name: finalClientName,
          companyName: finalCompanyName,
          email: finalClientEmail,
          phone: finalClientPhone,
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
      const placeholderEmail = `pending_${rfqCode}@placeholder.com`;
      if (client.email !== placeholderEmail) {
        await prisma.client.deleteMany({
          where: { email: placeholderEmail },
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
