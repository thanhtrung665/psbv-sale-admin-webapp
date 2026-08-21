import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { sendEmailViaGraph } from "@/lib/ms-graph";
import { prisma } from "@/lib/prisma";

/**
 * Send Dispatch Email via Microsoft Graph API
 *
 * This is a generic dispatch endpoint that can send any email with optional PDF attachment.
 * Used for:
 * - Sending dispatch confirmations
 * - Sending updated quotations
 * - General email communications
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      rfqCode,
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      attachmentUrl,
      fileName,
    } = await req.json();

    // 1. Validate required fields
    if (!to || !subject || !bodyHtml) {
      return NextResponse.json(
        { error: "Missing required fields (to, subject, bodyHtml)" },
        { status: 400 }
      );
    }

    console.log(`[send-dispatch] Preparing to send email to: ${to}`);

    // 2. Send email via MS Graph
    await sendEmailViaGraph({
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      bodyHtml,
      attachmentUrl: attachmentUrl || undefined,
      fileName: fileName || "attachment.pdf",
    });

    // 3. If an rfqCode is provided, update the status
    if (rfqCode) {
      await prisma.rFQ.updateMany({
        where: { rfqCode },
        data: {
          status: 'QUOTED_TO_CLIENT',
          updatedAt: new Date()
        }
      });
      console.log(`[send-dispatch] RFQ ${rfqCode} status updated to QUOTED_TO_CLIENT`);
    }

    return NextResponse.json({
      success: true,
      message: "Email đã được gửi thành công qua Outlook!",
      to,
      rfqCode: rfqCode || null,
    });

  } catch (error: any) {
    console.error("[send-dispatch] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to dispatch email"
      },
      { status: 500 }
    );
  }
}
