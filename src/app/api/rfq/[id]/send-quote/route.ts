import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailViaGraph } from "@/lib/ms-graph";

export const runtime = "nodejs";

/**
 * Send Quotation Email via Microsoft Graph API
 *
 * This endpoint:
 * 1. Fetches RFQ data
 * 2. Downloads the quotation PDF
 * 3. Sends email with PDF attachment via MS Graph
 * 4. Updates RFQ status to QUOTED_TO_CLIENT
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      attachmentUrl,
      fileName,
    } = await req.json();

    const rfqId = params.id;

    // 1. Validate required fields
    if (!to || !subject || !bodyHtml) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc (to, subject, bodyHtml)" },
        { status: 400 }
      );
    }

    if (!attachmentUrl) {
      return NextResponse.json(
        { error: "Chưa có file Quotation PDF. Vui lòng tải lại trang để sinh file." },
        { status: 400 }
      );
    }

    // 2. Fetch RFQ to verify it exists and get current status
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { client: true },
    });

    if (!rfq) {
      return NextResponse.json({ error: "Không tìm thấy RFQ" }, { status: 404 });
    }

    console.log(`[send-quote] Sending quotation for RFQ: ${rfq.rfqCode}`);

    // 3. Send email via MS Graph
    await sendEmailViaGraph({
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      bodyHtml,
      attachmentUrl,
      fileName: fileName || `Quotation_${rfq.rfqCode}.pdf`,
    });

    // 4. Update RFQ status
    await prisma.rFQ.update({
      where: { id: rfqId },
      data: {
        status: "QUOTED_TO_CLIENT",
        approvedById: (session.user as any)?.id,
      },
    });

    console.log(`[send-quote] Email sent successfully for RFQ: ${rfq.rfqCode}`);

    return NextResponse.json({
      success: true,
      message: "Phê duyệt & Gửi báo giá thành công!",
      rfqCode: rfq.rfqCode,
      status: "QUOTED_TO_CLIENT",
    });

  } catch (err: any) {
    console.error("[send-quote] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Có lỗi xảy ra khi gửi email"
      },
      { status: 500 }
    );
  }
}
