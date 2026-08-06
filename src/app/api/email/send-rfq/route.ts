import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const VALID_ACTIONS = [
  "SEND_RFO_SUPPLIER",
  "SEND_QUOTATION_CLIENT",
  "SEND_INTERNAL_APPROVAL",
] as const;

type EmailAction = (typeof VALID_ACTIONS)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rfqCode, rfqId, action, to, subject, html } = body as {
      rfqCode: string;
      rfqId?: string;
      action: EmailAction;
      to: string;
      subject: string;
      html: string;
    };

    // Validate inputs
    if (!rfqCode || !action || !subject || !html) {
      return NextResponse.json(
        { success: false, message: "Thiếu thông tin bắt buộc (rfqCode, action, subject, html)." },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action as EmailAction)) {
      return NextResponse.json(
        { success: false, message: `Email action không hợp lệ: ${action}` },
        { status: 400 }
      );
    }

    // Look up RFQ to get email addresses if not provided
    let resolvedTo = to;

    if (!resolvedTo) {
      const rfq = await prisma.rFQ.findUnique({
        where: rfqId ? { id: rfqId } : { rfqCode },
        include: { client: true },
      });

      if (!rfq) {
        return NextResponse.json(
          { success: false, message: `Không tìm thấy đơn hàng: ${rfqCode}` },
          { status: 404 }
        );
      }

      if (action === "SEND_QUOTATION_CLIENT") {
        resolvedTo = rfq.client?.email || "";
      } else if (action === "SEND_INTERNAL_APPROVAL") {
        // For internal approvals, send to the logged-in user's manager / configured email
        const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
        resolvedTo = (session.user as any)?.email || "salesdir@psbvn.com";
      }
    }

    if (!resolvedTo) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Không có địa chỉ email người nhận. Vui lòng nhập email hoặc cấu hình thông tin Khách/Hãng.",
        },
        { status: 400 }
      );
    }

    // Send email via Resend (nodemailer in lib/email.ts)
    await sendEmail({
      to: resolvedTo,
      subject,
      html,
    });

    // Log the sent email as a Document record
    if (rfqId) {
      await prisma.document.create({
        data: {
          rfqId,
          type: `EMAIL_${action}`,
          fileUrl: `mailto:${resolvedTo}?subject=${encodeURIComponent(subject)}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Mail đã được gửi đến: ${resolvedTo}`,
      to: resolvedTo,
      action,
      rfqCode,
    });
  } catch (error: any) {
    console.error("[send-rfq-email]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Lỗi máy chủ khi gửi mail." },
      { status: 500 }
    );
  }
}
