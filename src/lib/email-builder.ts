/**
 * Email Template Builder for PSBV Sales Agent Platform
 * Generates HTML email templates for various email types
 */

const PSBV_LOGO_URL = "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/logo.png";
const PSBV_COMPANY = "PSBV Trading & Service Co., Ltd.";

/**
 * Build RFO (Request for Quotation) email HTML
 * Used by RFO Review page
 */
export function buildRfoEmailHtml(options: {
  greetingBody: string;
  orderTableHtml: string;
  supplierLogoUrl?: string;
  catalogUrl?: string;
  senderName?: string;
}): string {
  const { greetingBody, orderTableHtml, supplierLogoUrl, catalogUrl, senderName } = options;

  const logo = supplierLogoUrl || PSBV_LOGO_URL;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px; border-bottom: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="${logo}" alt="Company Logo" style="max-width: 160px; height: auto;">
                  </td>
                  <td align="right">
                    <h1 style="margin: 0; font-size: 18px; color: #1e293b; font-weight: 600;">PSBV Trading & Service Co., Ltd.</h1>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Request for Quotation (RFO)</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & Body -->
          <tr>
            <td style="padding: 28px;">
              <div style="color: #334155; font-size: 14px; line-height: 1.7;">
                ${greetingBody}
              </div>
            </td>
          </tr>

          <!-- Order Table -->
          <tr>
            <td style="padding: 0 28px 28px 28px;">
              ${orderTableHtml}
            </td>
          </tr>

          ${catalogUrl ? `
          <!-- Catalog Link -->
          <tr>
            <td style="padding: 0 28px 20px 28px;">
              <a href="${catalogUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                📎 Download Product Catalog
              </a>
            </td>
          </tr>
          ` : ""}

          <!-- Footer Card -->
          <tr>
            <td style="padding: 24px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #1e293b;">
                ${senderName || "PSBV Sales Team"}
              </p>
              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                Sales Department<br>
                PSBV Trading & Service Co., Ltd.<br>
                Email: sales@psbv.com | Phone: +84-28-XXXX-XXXX
              </p>
            </td>
          </tr>
        </table>

        <!-- Disclaimer -->
        <p style="margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center; max-width: 640px;">
          This email and any attachments are confidential. If you received this email in error, please notify the sender immediately.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Build order items table HTML for RFO emails
 */
export function buildOrderTableHtml(items: Array<{
  lineNo: number;
  standardPartNo: string | null;
  rawDescription: string;
  qty: number;
  uom: string;
}>): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; color: #64748b;">${item.lineNo}</td>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; font-weight: 600;">${item.standardPartNo || item.lineNo || "-"}</td>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px;">${item.rawDescription || "-"}</td>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${item.qty || 0}</td>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 12px; text-transform: uppercase;">${item.uom || "PCS"}</td>
      </tr>
    `
    )
    .join("");

  return `
    <table width="100%" style="border-collapse: collapse; font-size: 13px; color: #1e293b;">
      <thead>
        <tr style="background-color: #f1f5f9;">
          <th style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">#</th>
          <th style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Part No.</th>
          <th style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</th>
          <th style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Qty</th>
          <th style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">UOM</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Build Quotation email HTML
 */
export function buildQuotationEmailHtml(options: {
  rfqCode: string;
  clientName: string;
  totalAmount?: string;
  validityDays?: number;
  additionalNotes?: string;
}): string {
  const {
    rfqCode,
    clientName,
    totalAmount,
    validityDays = 30,
    additionalNotes,
  } = options;

  const body = `
    <p>Dear ${clientName},</p>

    <p>Thank you for your inquiry. Please find our quotation attached for your review.</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; background: #f8fafc; width: 140px;">Quotation No.</td>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${rfqCode}</td>
      </tr>
      ${totalAmount ? `
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; background: #f8fafc;">Total Amount</td>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #059669; font-weight: 600;">${totalAmount}</td>
      </tr>
      ` : ""}
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; background: #f8fafc;">Validity</td>
        <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${validityDays} days from quote date</td>
      </tr>
    </table>

    ${additionalNotes ? `
    <p><strong>Notes:</strong></p>
    <p>${additionalNotes}</p>
    ` : ""}

    <p>Please review the attached quotation and do not hesitate to contact us if you have any questions.</p>

    <p>We look forward to your favorable response.</p>

    <p>Best regards,</p>
  `;

  return buildEmailWrapper(body, {
    title: `Quotation ${rfqCode}`,
  });
}

/**
 * Build generic email wrapper with header and footer
 */
function buildEmailWrapper(
  content: string,
  options?: { title?: string; logoUrl?: string }
): string {
  const title = options?.title || "";
  const logoUrl = options?.logoUrl;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 24px; border-bottom: 1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <h1 style="margin: 0; font-size: 20px; color: #1e293b;">PSBV Trading & Service Co., Ltd.</h1>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Sales Agent Platform</p>
                      </td>
                      <td align="right">
                        <img src="${logoUrl || PSBV_LOGO_URL}" alt="PSBV Logo" style="max-width: 150px; height: auto;">
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 24px;">
                  ${title ? `<h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">${title}</h2>` : ""}
                  <div style="color: #475569; line-height: 1.6; font-size: 14px;">
                    ${content}
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                    <strong style="color: #1e293b;">PSBV Sales Team</strong><br>
                    Sales Department<br>
                    PSBV Trading & Service Co., Ltd.<br>
                    Email: sales@psbv.com | Phone: +84-28-XXXX-XXXX
                  </p>
                </td>
              </tr>
            </table>

            <!-- Disclaimer -->
            <p style="margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center;">
              This email and any attachments are confidential. If you received this email in error, please notify the sender immediately.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
