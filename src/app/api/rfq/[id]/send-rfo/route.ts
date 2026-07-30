import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
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

    // Send the email via Resend
    const { data, error } = await resend.emails.send({
      from: "PSBV Sales Agent <onboarding@resend.dev>",
      to: supplierEmail,
      cc: ccArray.length > 0 ? ccArray : undefined,
      subject: emailSubject,
      html: emailBody,
    });

    if (error) {
      console.error("Resend Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Update RFQ — store supplier name and advance status to RFO_SENT_TO_SUPPLIER
    const updatedRfq = await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        supplierName,
        status: "RFO_SENT_TO_SUPPLIER",
      },
    });

    return NextResponse.json({ success: true, data, rfq: updatedRfq });
  } catch (error: any) {
    console.error("[send-rfo] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}
