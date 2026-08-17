import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import "isomorphic-fetch";

export const getGraphClient = () => {
  // 1. Kiểm tra biến môi trường ngay lúc gọi hàm
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("[MS GRAPH FATAL] Thiếu biến môi trường AZURE trong file .env!");
  }

  // 2. Khởi tạo Credential
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  // 3. Khởi tạo Client với Custom Auth Provider
  return Client.init({
    debugLogging: true,
    authProvider: async (done) => {
      try {
        // Tự động gọi thẳng xuống Azure để xin Token với scope .default
        const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
        
        if (tokenResponse && tokenResponse.token) {
          console.log("✅ [MS GRAPH] Đã lấy thành công Access Token!");
          done(null, tokenResponse.token);
        } else {
          done(new Error("Token response bị rỗng từ Azure!"), null);
        }
      } catch (err: any) {
        console.error("❌ [AZURE AUTH ERROR] Lỗi từ chối cấp Token từ máy chủ Azure:", err?.message || err);
        done(err, null);
      }
    },
  });
};

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
  const mailbox = process.env.MS_GRAPH_MAILBOX;

  if (!mailbox) {
    throw new Error("Missing Microsoft Graph configuration (MS_GRAPH_MAILBOX)");
  }

  const graphClient = getGraphClient();

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
