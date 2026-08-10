import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

async function sendEmailViaGraph(to: string, cc: string, bcc: string, subject: string, bodyHtml: string, attachmentUrl: string, accessToken: string, customFileName?: string) {
  // 1. Download the PDF from the provided attachmentUrl
  const fileRes = await fetch(attachmentUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to download attachment from ${attachmentUrl}`);
  }
  const arrayBuffer = await fileRes.arrayBuffer();
  const base64String = Buffer.from(arrayBuffer).toString("base64");
  
  // Extract filename from URL or use custom filename
  let fileName = customFileName;
  if (!fileName) {
    const urlParts = attachmentUrl.split('/');
    fileName = urlParts[urlParts.length - 1] || "Document.pdf";
  }

  const parseEmails = (str: string) => str ? str.split(",").map(e => ({ emailAddress: { address: e.trim() } })).filter(e => e.emailAddress.address) : [];

  // 2. Prepare MS Graph API Message Object
  const message = {
    message: {
      subject: subject,
      body: {
        contentType: "HTML",
        content: bodyHtml,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
      ccRecipients: parseEmails(cc),
      bccRecipients: parseEmails(bcc),
      attachments: [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: fileName.includes(".pdf") ? fileName : `${fileName}.pdf`,
          contentType: "application/pdf",
          contentBytes: base64String,
        },
      ],
    },
    saveToSentItems: "true",
  };

  // 3. POST to Microsoft Graph API
  const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!graphRes.ok) {
    const errorData = await graphRes.text();
    console.error("MS Graph API Error:", errorData);
    throw new Error(`MS Graph API failed: ${graphRes.statusText}`);
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { to, cc, bcc, subject, bodyHtml, attachmentUrl, fileName, senderName } = await req.json();

    if (!to || !subject || !attachmentUrl) {
      return NextResponse.json({ error: "Missing required fields (to, subject, attachmentUrl)" }, { status: 400 });
    }

    // Attempt to get Graph API access token.
    // NOTE: In a real app, you get this from NextAuth session.accessToken (if using Azure AD provider),
    // or from environment variables if using a daemon/service principal.
    const accessToken = process.env.MS_GRAPH_ACCESS_TOKEN || (session as any).accessToken;

    if (!accessToken) {
      // Fallback or explicit failure if no token is available
      console.warn("No MS Graph Access Token found. You need to configure Azure AD Provider in NextAuth or provide MS_GRAPH_ACCESS_TOKEN.");
      return NextResponse.json(
        { error: "Microsoft Graph Access Token is missing. Cannot dispatch email." },
        { status: 403 }
      );
    }

    // Construct final HTML with senderName and Logo if senderName is provided
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

    // Call our Graph API function
    await sendEmailViaGraph(to, cc || "", bcc || "", subject, finalBodyHtml, attachmentUrl, accessToken, fileName);

    return NextResponse.json({
      success: true,
      message: "Email dispatched successfully via MS Graph API",
    });
  } catch (error: any) {
    console.error("[send-dispatch]", error);
    return NextResponse.json({ error: error.message || "Failed to dispatch email" }, { status: 500 });
  }
}
