import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailViaGraph } from "@/lib/ms-graph";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      supplierEmail,
      supplierName,
      ccEmails,
      bccEmails,
      emailSubject,
      emailBody,
      // catalogUrl is already baked into emailBody by the builder — accepted but not re-used here
    } = body;

    if (!supplierEmail || !emailSubject || !emailBody) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc (email, tiêu đề, nội dung)" }, { status: 400 });
    }

    // Verify no client info leaks — body is pre-sanitized by email-builder.ts on the client side.
    // The emailBody passed here must be built by buildRfoEmailHtml (UI responsibility).

    // Parse CC emails from comma-separated string
    const ccArray: string[] = ccEmails
      ? (ccEmails as string).split(",").map((e: string) => e.trim()).filter(Boolean)
      : [];
      
    // Parse BCC emails from comma-separated string
    const bccArray: string[] = bccEmails
      ? (bccEmails as string).split(",").map((e: string) => e.trim()).filter(Boolean)
      : [];

    // Send the email via Microsoft Graph (drilling@psbvn.com)
    await sendEmailViaGraph({
      to: supplierEmail,
      cc: ccArray.length > 0 ? ccArray.join(",") : undefined,
      bcc: bccArray.length > 0 ? bccArray.join(",") : undefined,
      subject: emailSubject,
      bodyHtml: emailBody,
    });

    // Update RFQ — store supplier name and advance status to RFO_SENT_TO_SUPPLIER
    const updatedRfq = await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        supplierName,
        status: "RFO_SENT_TO_SUPPLIER",
      },
    });

    return NextResponse.json({ success: true, rfq: updatedRfq });
  } catch (error: any) {
    console.error("[send-rfo] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}
