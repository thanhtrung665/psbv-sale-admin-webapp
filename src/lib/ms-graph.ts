import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

export function getGraphClient() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing Microsoft Graph credentials. Please set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET."
    );
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  return Client.init({
    authProvider: async (done) => {
      try {
        const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
        if (tokenResponse?.token) {
          done(null, tokenResponse.token);
        } else {
          done(new Error("Empty token response from Azure AD"), null);
        }
      } catch (err: any) {
        console.error("[MS Graph] Azure AD token acquisition failed:", err?.message || err);
        done(err, null);
      }
    },
  });
}

function getMailbox(): string {
  const mailbox = process.env.MS_GRAPH_MAILBOX;
  if (!mailbox) {
    throw new Error("Missing Microsoft Graph configuration (MS_GRAPH_MAILBOX)");
  }
  return mailbox;
}

export interface GraphEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  attachmentUrl?: string;
  fileName?: string;
  senderName?: string;
}

async function downloadAttachmentAsBase64(attachmentUrl: string): Promise<string> {
  const fetchUrl = attachmentUrl.startsWith("http")
    ? attachmentUrl
    : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${attachmentUrl}`;

  const fileRes = await fetch(fetchUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to download attachment from ${fetchUrl}: ${fileRes.status}`);
  }
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

function parseEmails(str: string | undefined) {
  return str
    ? str
        .split(",")
        .map((e) => ({ emailAddress: { address: e.trim() } }))
        .filter((e) => e.emailAddress.address)
    : [];
}

/**
 * Send email via Microsoft Graph API (/users/{mailbox}/sendMail).
 * Requires Mail.Send application permission on the Azure AD app registration.
 */
export async function sendEmailViaGraph({
  to,
  cc,
  bcc,
  subject,
  bodyHtml,
  attachmentUrl,
  fileName,
  senderName,
}: GraphEmailPayload): Promise<void> {
  const mailbox = getMailbox();
  const graphClient = getGraphClient();

  let finalBodyHtml = bodyHtml;
  if (senderName) {
    const PSBV_LOGO_URL =
      "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/logo.png";
    finalBodyHtml = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        ${bodyHtml}
        <br/><br/>
        <p style="margin:0 0 20px 0; font-size:14px; font-weight:600; color:#0f172a;">${senderName}</p>
        <img src="${PSBV_LOGO_URL}" alt="PSBV Logo" width="220" style="max-width:250px; height:auto; object-fit:contain; display:block;" />
      </div>
    `;
  }

  const message: any = {
    subject,
    body: {
      contentType: "HTML",
      content: finalBodyHtml,
    },
    toRecipients: parseEmails(to),
  };

  const ccRecipients = parseEmails(cc);
  const bccRecipients = parseEmails(bcc);
  if (ccRecipients.length > 0) message.ccRecipients = ccRecipients;
  if (bccRecipients.length > 0) message.bccRecipients = bccRecipients;

  if (attachmentUrl) {
    const base64String = await downloadAttachmentAsBase64(attachmentUrl);
    const attachmentName = fileName || "attachment.pdf";
    message.attachments = [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: attachmentName.includes(".pdf") ? attachmentName : `${attachmentName}.pdf`,
        contentType: "application/pdf",
        contentBytes: base64String,
      },
    ];
  }

  console.log(`[MS Graph] Sending email from ${mailbox} to ${to}: "${subject}"`);
  await graphClient.api(`/users/${mailbox}/sendMail`).post({
    message,
    saveToSentItems: "true",
  });
  console.log("[MS Graph] Email sent successfully");
}

/**
 * Verifies the app registration can obtain a token and that MS_GRAPH_MAILBOX resolves to a real user.
 * Used by GET /api/email/test-ms.
 */
export async function testMsGraphConnection(): Promise<{
  success: boolean;
  message: string;
  fromEmail?: string;
}> {
  try {
    const mailbox = getMailbox();
    const graphClient = getGraphClient();
    await graphClient.api(`/users/${mailbox}`).select("id,mail,userPrincipalName").get();
    return {
      success: true,
      message: "Microsoft Graph API connection successful!",
      fromEmail: mailbox,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Unknown error",
    };
  }
}
