import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import "isomorphic-fetch";

export interface GraphEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  attachmentUrl: string;
  fileName: string;
  senderName?: string;
}

export async function sendEmailViaGraph({
  to,
  cc = "",
  bcc = "",
  subject,
  bodyHtml,
  attachmentUrl,
  fileName,
  senderName,
}: GraphEmailPayload) {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const mailbox = process.env.MS_GRAPH_MAILBOX;

  if (!tenantId || !clientId || !clientSecret || !mailbox) {
    throw new Error(
      "Missing Microsoft Graph configuration (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MS_GRAPH_MAILBOX)"
    );
  }

  // 1. Initialize MS Graph Client with Application Credentials
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  const graphClient = Client.initWithMiddleware({
    authProvider: authProvider,
  });

  // 2. Fetch and encode the PDF Attachment
  // Ensure the URL is fully qualified before fetching
  const fetchUrl = attachmentUrl.startsWith("http")
    ? attachmentUrl
    : `http://localhost:3000${attachmentUrl}`;
    
  const fileRes = await fetch(fetchUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to download attachment from ${fetchUrl}`);
  }
  const arrayBuffer = await fileRes.arrayBuffer();
  const base64String = Buffer.from(arrayBuffer).toString("base64");

  // 3. Format Body HTML with Sender Name and Logo if provided
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

  // 4. Construct the MS Graph Email Payload
  const parseEmails = (str: string) =>
    str
      ? str
          .split(",")
          .map((e) => ({ emailAddress: { address: e.trim() } }))
          .filter((e) => e.emailAddress.address)
      : [];

  const message = {
    message: {
      subject: subject,
      body: {
        contentType: "HTML",
        content: finalBodyHtml,
      },
      toRecipients: parseEmails(to),
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

  // 5. Dispatch Email via Graph API
  await graphClient.api(`/users/${mailbox}/sendMail`).post(message);
}
