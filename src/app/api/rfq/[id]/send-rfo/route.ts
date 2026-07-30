import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

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
    const { supplierEmail, supplierName, ccEmails, emailSubject, emailBody } = body;

    if (!supplierEmail || !emailSubject || !emailBody) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }

    const ccArray = ccEmails
      ? ccEmails.split(",").map((e: string) => e.trim()).filter((e: string) => e)
      : [];

    await sendEmail({
      to: supplierEmail,
      cc: ccArray,
      subject: emailSubject,
      html: emailBody,
    });

    // Cập nhật thông tin Supplier vào RFQ và đổi status
    const updatedRfq = await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        supplierName,
        status: "RFO_SENT_TO_SUPPLIER",
      },
    });

    return NextResponse.json({ success: true, rfq: updatedRfq });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
