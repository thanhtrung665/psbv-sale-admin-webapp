/**
 * Microsoft Graph API Client for Email Operations
 * Uses Client Credentials OAuth 2.0 flow (App-only token)
 *
 * Required Environment Variables:
 * - MS_GRAPH_TENANT_ID
 * - MS_GRAPH_CLIENT_ID
 * - MS_GRAPH_CLIENT_SECRET
 * - MS_GRAPH_FROM_EMAIL (sender email address)
 */

interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  attachmentUrl?: string;
  fileName?: string;
  senderEmail?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get access token using Client Credentials flow
 * Supports both standard (MS_GRAPH_*) and Azure AD legacy (AZURE_*) env vars
 */
async function getAccessToken(): Promise<string> {
  // Support both naming conventions
  const tenantId = process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error("Missing Microsoft Graph credentials:");
    console.error("- MS_GRAPH_TENANT_ID / AZURE_TENANT_ID:", !!tenantId);
    console.error("- MS_GRAPH_CLIENT_ID / AZURE_CLIENT_ID:", !!clientId);
    console.error("- MS_GRAPH_CLIENT_SECRET / AZURE_CLIENT_SECRET:", !!clientSecret);
    throw new Error(
      "Missing Microsoft Graph credentials. Please set:\n" +
      "- MS_GRAPH_TENANT_ID (or AZURE_TENANT_ID)\n" +
      "- MS_GRAPH_CLIENT_ID (or AZURE_CLIENT_ID)\n" +
      "- MS_GRAPH_CLIENT_SECRET (or AZURE_CLIENT_SECRET)"
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token acquisition failed:", errorText);
    throw new Error(`Failed to acquire access token: ${response.status}`);
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

/**
 * Parse comma-separated email string into array
 */
function parseEmails(emailStr: string | undefined): { emailAddress: { address: string } }[] {
  if (!emailStr) return [];
  return emailStr
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ emailAddress: { address: email } }));
}

/**
 * Download file from URL and convert to base64
 */
async function downloadFileAsBase64(url: string): Promise<string> {
  // Handle data URLs (base64 embedded)
  if (url.startsWith("data:")) {
    const matches = url.match(/data:application\/pdf;base64,(.+)/);
    if (matches) {
      return matches[1];
    }
  }

  // Handle relative URLs
  let fullUrl = url;
  if (url.startsWith("/")) {
    fullUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${url}`;
  }

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/**
 * Send email via Microsoft Graph API
 * Requires Mail.Send permission in Azure AD app registration
 */
export async function sendEmailViaGraph(options: SendEmailOptions): Promise<void> {
  const {
    to,
    cc,
    bcc,
    subject,
    bodyHtml,
    attachmentUrl,
    fileName,
    senderEmail,
  } = options;

  // Get access token
  const accessToken = await getAccessToken();

  // Determine sender email - support both naming conventions
  const fromEmail = senderEmail || process.env.MS_GRAPH_FROM_EMAIL || process.env.MS_GRAPH_MAILBOX;
  if (!fromEmail) {
    throw new Error("No sender email configured. Set MS_GRAPH_FROM_EMAIL environment variable.");
  }

  // Build recipients
  const toRecipients = [{ emailAddress: { address: to } }];
  const ccRecipients = parseEmails(cc);
  const bccRecipients = parseEmails(bcc);

  // Build message body
  const messageBody: { contentType: string; content: string } = {
    contentType: "HTML",
    content: bodyHtml,
  };

  // Build attachments if provided
  const attachments: any[] = [];
  if (attachmentUrl) {
    const base64Content = await downloadFileAsBase64(attachmentUrl);
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: fileName || "attachment.pdf",
      contentType: "application/pdf",
      contentBytes: base64Content,
    });
  }

  // Build the complete message
  const message: any = {
    subject,
    body: messageBody,
    toRecipients,
  };

  if (ccRecipients.length > 0) {
    message.ccRecipients = ccRecipients;
  }

  if (bccRecipients.length > 0) {
    message.bccRecipients = bccRecipients;
  }

  if (attachments.length > 0) {
    message.attachments = attachments;
  }

  // Graph API request body
  const requestBody = {
    message,
    saveToSentItems: "true",
  };

  // Send mail using /users/{userPrincipalName}/sendMail endpoint
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`;

  console.log(`[MS Graph] Sending email from: ${fromEmail}`);
  console.log(`[MS Graph] To: ${to}`);
  console.log(`[MS Graph] Subject: ${subject}`);

  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[MS Graph] Send mail failed:", errorText);
    throw new Error(`Failed to send email: ${response.status} - ${errorText}`);
  }

  console.log("[MS Graph] Email sent successfully!");
}

/**
 * Utility function to build basic HTML email with logo
 */
export function buildEmailHtml(options: {
  title?: string;
  body?: string;
  senderName?: string;
  logoUrl?: string;
}): string {
  const title = options.title || "";
  const body = options.body || "";
  const senderName = options.senderName || "PSBV Sales Team";
  const logoUrl = options.logoUrl;

  const defaultLogo = "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/logo.png";
  const logo = logoUrl || defaultLogo;

  return `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px;">
        ${title ? `<h2 style="color: #1e293b; margin: 0 0 16px 0;">${title}</h2>` : ""}
        <div style="color: #475569; line-height: 1.6;">
          ${body}
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="margin: 0; font-weight: 600; color: #1e293b;">${senderName}</p>
        <p style="margin: 8px 0 0 0; color: #64748b;">PSBV Trading & Service Co., Ltd.</p>
        <img src="${logo}" alt="PSBV Logo" style="max-width: 200px; height: auto; margin-top: 16px; display: block;">
      </div>
    </div>
  `;
}

/**
 * Test function to verify MS Graph connectivity
 */
export async function testMsGraphConnection(): Promise<{
  success: boolean;
  message: string;
  fromEmail?: string;
}> {
  try {
    const accessToken = await getAccessToken();
    // Support both naming conventions
    const fromEmail = process.env.MS_GRAPH_FROM_EMAIL || process.env.MS_GRAPH_MAILBOX;

    if (!fromEmail) {
      return {
        success: false,
        message: "MS_GRAPH_FROM_EMAIL / MS_GRAPH_MAILBOX not configured",
      };
    }

    // Verify the token works by making a simple request
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      return {
        success: true,
        message: "Microsoft Graph API connection successful!",
        fromEmail,
      };
    } else {
      const error = await response.text();
      return {
        success: false,
        message: `API verification failed: ${response.status} - ${error}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Unknown error",
    };
  }
}
