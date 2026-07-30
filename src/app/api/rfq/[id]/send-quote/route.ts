import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQuotationPdf } from "@/lib/pdf-renderer";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { subject, bodyHtml } = await req.json();
    const rfqId = params.id;

    // 1. Fetch RFQ & verify status
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { client: true },
    });
    
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2. Generate PDF Buffer
    const pdfBuffer = await generateQuotationPdf(rfqId);

    // 3. Save PDF to local public/uploads for preview/download
    const fileName = `Quotation_${rfq.rfqCode}_${Date.now()}.pdf`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);
    const fileUrl = `/uploads/${fileName}`;

    // 4. Save to DB Document table
    await prisma.document.create({
      data: {
        rfqId,
        type: "MVPO_QUOTATION_PDF",
        fileUrl,
      },
    });

    // 5. Send Email via Nodemailer
    // Note: We use mock console if env vars are missing
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"PSBV Sales" <${smtpUser}>`,
        to: rfq.client.email,
        subject: subject || `Quotation for ${rfq.rfqCode}`,
        html: bodyHtml || `<p>Please find the attached quotation.</p>`,
        attachments: [
          {
            filename: `Quotation_${rfq.rfqCode}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
      console.log(`[Email Sent] Successfully sent to ${rfq.client.email}`);
    } else {
      console.log(`[Email MOCK] Would send email to ${rfq.client.email} with subject: ${subject}`);
    }

    // 6. Update RFQ Status to QUOTED_TO_CLIENT
    await prisma.rFQ.update({
      where: { id: rfqId },
      data: {
        status: "QUOTED_TO_CLIENT",
        approvedById: (session.user as any).id,
      },
    });

    return NextResponse.json({
      message: "Phê duyệt & Gửi báo giá thành công!",
      fileUrl,
      status: "QUOTED_TO_CLIENT"
    });

  } catch (err: any) {
    console.error("[send-quote]", err);
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra" }, { status: 500 });
  }
}
