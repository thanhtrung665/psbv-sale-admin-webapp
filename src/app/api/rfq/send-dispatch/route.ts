import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { sendEmailViaGraph } from "@/lib/ms-graph";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rfqCode, to, cc, bcc, subject, bodyHtml, attachmentUrl, fileName, senderName } = await req.json();

    if (!to || !subject || !attachmentUrl) {
      return NextResponse.json({ error: "Missing required fields (to, subject, attachmentUrl)" }, { status: 400 });
    }

    // Dispatch the email using the application credential service
    await sendEmailViaGraph({
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      attachmentUrl,
      fileName,
      senderName,
    });

    // If an rfqCode is provided, update the status in the DB
    if (rfqCode) {
      await prisma.rFQ.updateMany({
        where: { rfqCode },
        data: { 
          status: 'QUOTED_TO_CLIENT',
          updatedAt: new Date()
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Email đã được gửi thành công qua Outlook!",
    });
  } catch (error: any) {
    console.error("[send-dispatch]", error);
    return NextResponse.json({ error: error.message || "Failed to dispatch email" }, { status: 500 });
  }
}
