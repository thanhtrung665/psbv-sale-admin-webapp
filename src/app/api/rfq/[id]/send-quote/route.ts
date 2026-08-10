import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function sendEmailViaGraph(to: string, cc: string, bcc: string, subject: string, bodyHtml: string, pdfUrl: string, accessToken: string, customFileName: string) {
  const fileRes = await fetch(pdfUrl);
  if (!fileRes.ok) throw new Error(`Failed to download attachment from ${pdfUrl}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  const base64String = Buffer.from(arrayBuffer).toString("base64");
  
  const parseEmails = (str: string) => str ? str.split(",").map(e => ({ emailAddress: { address: e.trim() } })).filter(e => e.emailAddress.address) : [];

  const message = {
    message: {
      subject: subject,
      body: { contentType: "HTML", content: bodyHtml },
      toRecipients: [{ emailAddress: { address: to } }],
      ccRecipients: parseEmails(cc),
      bccRecipients: parseEmails(bcc),
      attachments: [{
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: customFileName,
        contentType: "application/pdf",
        contentBytes: base64String,
      }],
    },
    saveToSentItems: "true",
  };

  const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!graphRes.ok) {
    const errorData = await graphRes.text();
    console.error("MS Graph API Error:", errorData);
    throw new Error(`MS Graph API failed: ${graphRes.statusText}`);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { to, cc, bcc, senderName, subject, bodyHtml, attachmentUrl, fileName } = await req.json();
    const rfqId = params.id;

    // 1. Fetch RFQ & verify status
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { client: true },
    });
    
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!attachmentUrl) {
      return NextResponse.json({ error: "Chưa có file Quotation PDF. Vui lòng tải lại trang để sinh file." }, { status: 400 });
    }

    const accessToken = process.env.MS_GRAPH_ACCESS_TOKEN || (session as any).accessToken;
    if (!accessToken) {
      console.warn("No MS Graph Access Token found.");
      return NextResponse.json({ error: "Microsoft Graph Access Token is missing." }, { status: 403 });
    }

    let finalBodyHtml = bodyHtml;
    if (senderName) {
      const PSBV_LOGO_URL = "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/logo.png";
      finalBodyHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          ${bodyHtml}
          <br/><br/>
          <p style="margin:0 0 20px 0; font-size:14px; font-weight:600; color:#0f172a;">${senderName}</p>
          <img src="${PSBV_LOGO_URL}" alt="PSBV Logo" width="220" style="max-width:250px; height:auto; object-fit:contain; display:block;" />
        </div>
      `;
    }

    // Since proxy download uses the base URL in our setup, we can fetch the original attachmentUrl directly.
    // ensure attachmentUrl is fully qualified if it's relative
    const fetchUrl = attachmentUrl.startsWith("http") ? attachmentUrl : `http://localhost:3000${attachmentUrl}`;

    await sendEmailViaGraph(to, cc || "", bcc || "", subject, finalBodyHtml, fetchUrl, accessToken, fileName || "Quotation.pdf");

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
      fileUrl: attachmentUrl,
      status: "QUOTED_TO_CLIENT"
    });

  } catch (err: any) {
    console.error("[send-quote]", err);
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra" }, { status: 500 });
  }
}
