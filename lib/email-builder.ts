/**
 * Email Builder Service — PSBV Sales Agent Platform
 * Builds modular HTML email for RFO dispatch to suppliers.
 * IMPORTANT: Must NOT contain any client/customer information.
 */

export interface RfoEmailParams {
  greetingBody: string;        // Editable greeting + body text (HTML or plain)
  orderTableHtml: string;      // Pre-built HTML table of order items
  supplierLogoUrl?: string;    // Logo of the supplier/manufacturer
  catalogUrl?: string;         // Optional link to product catalog / image form
}

export function buildRfoEmailHtml({
  greetingBody,
  orderTableHtml,
  supplierLogoUrl,
  catalogUrl,
}: RfoEmailParams): string {
  const supplierLogoBlock = supplierLogoUrl
    ? `<img src="${supplierLogoUrl}" alt="Manufacturer Logo" style="max-height:56px; max-width:200px; object-fit:contain; margin-bottom:20px; display:block;" />`
    : "";

  const catalogBlock = catalogUrl
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:#f0f7ff; border:1.5px solid #bfdbfe; border-left:4px solid #2563eb; border-radius:8px; padding:18px 22px;">
          <p style="margin:0 0 6px 0; font-size:13px; font-weight:600; color:#1e40af; text-transform:uppercase; letter-spacing:0.05em;">📎 Product Catalog / Reference Images</p>
          <p style="margin:0 0 10px 0; font-size:13px; color:#334155;">Please refer to the product catalog and images at the link below before preparing your quotation:</p>
          <a href="${catalogUrl}" target="_blank" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; font-size:13px; font-weight:600; padding:9px 20px; border-radius:6px;">
            🔗 View Catalog / Images →
          </a>
        </td>
      </tr>
    </table>`
    : "";

  const psbvFooterCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:40px; border:1px solid #cbd5e1; border-radius:8px; border-top:3px solid #00529c; overflow:hidden; font-family:Arial,sans-serif;">
      <tr>
        <td style="padding:18px 20px; vertical-align:middle; width:110px; border-right:1px solid #e2e8f0; background:#f8fafc; text-align:center;">
          <img src="https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/psbv-logo.png"
               alt="PSBV Logo"
               style="height:48px; max-width:100px; object-fit:contain; display:block; margin:0 auto;"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
          />
          <span style="display:none; font-size:20px; font-weight:900; color:#00529c; letter-spacing:-1px;">PSBV</span>
        </td>
        <td style="padding:14px 20px; vertical-align:middle; background:#fff;">
          <p style="margin:0 0 2px 0; font-size:14px; font-weight:700; color:#00529c; line-height:1.3;">CỔ PHẦN THIẾT BỊ VÀ DỊCH VỤ DẦU KHÍ PSBV</p>
          <p style="margin:0 0 2px 0; font-size:12px; color:#475569;">📍 Địa chỉ: Tầng 5, Tòa nhà Đạt Gia, 98 Nguyễn Thị Minh Khai, P. Bến Thành, Q.1, TP. HCM</p>
          <p style="margin:0 0 2px 0; font-size:12px; color:#475569;">📞 Tel: (+84) 28 3823 xxxx &nbsp;|&nbsp; 📱 Mobile: (+84) 90x xxx xxxx</p>
          <p style="margin:0; font-size:12px; color:#475569;">
            ✉ <a href="mailto:sales@psbv.vn" style="color:#0ea5e9; text-decoration:none;">sales@psbv.vn</a>
            &nbsp;|&nbsp;
            🌐 <a href="https://www.psbv.vn" target="_blank" style="color:#0ea5e9; text-decoration:none;">www.psbv.vn</a>
          </p>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:10px 20px; background:#f1f5f9; border-top:1px solid #e2e8f0;">
          <p style="margin:0; font-size:10px; color:#94a3b8; font-style:italic; line-height:1.6;">
            CONFIDENTIALITY NOTICE: This email and any attachments are for the exclusive and confidential use of the intended recipient. 
            If you are not the intended recipient, please do not read, distribute, or take action in reliance upon this message. 
            If you have received this email in error, please notify us immediately by return email and delete this message. 
            Thank you for your cooperation.
          </p>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Request for Offer</title>
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 0;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; max-width:100%;">
          
          <!-- Top accent bar -->
          <tr>
            <td style="background:#00529c; height:4px; padding:0;"></td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:32px 36px;">
              
              <!-- Supplier Logo -->
              ${supplierLogoBlock}

              <!-- Greeting / Body -->
              <div style="font-size:14px; color:#1e293b; line-height:1.8;">
                ${greetingBody}
              </div>

              <!-- Product Table -->
              <div style="margin-top:24px;">
                ${orderTableHtml}
              </div>

              <!-- Catalog Link -->
              ${catalogBlock}

              <!-- PSBV Footer Card -->
              ${psbvFooterCard}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the order items HTML table (supplier-safe, no client info)
 */
export function buildOrderTableHtml(
  items: { lineNo: number; standardPartNo: string | null; rawPartNumber: string; rawDescription: string; qty: number; uom?: string }[]
): string {
  const rows = items.map(
    (item, idx) => `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafc"}">
      <td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:center; color:#64748b; font-size:12px;">${item.lineNo}</td>
      <td style="padding:10px 12px; border:1px solid #e2e8f0; font-family:monospace; font-size:12px; color:#0f172a; font-weight:600;">${item.standardPartNo || item.rawPartNumber}</td>
      <td style="padding:10px 12px; border:1px solid #e2e8f0; font-size:13px; color:#334155;">${item.rawDescription}</td>
      <td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:center; font-size:13px; color:#0f172a; font-weight:600;">${item.qty}</td>
      <td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:center; font-size:12px; color:#64748b;">${item.uom || "PCS"}</td>
    </tr>`
  ).join("");

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-radius:8px; overflow:hidden; font-size:13px;">
    <thead>
      <tr style="background:#00529c; color:#fff;">
        <th style="padding:10px 12px; border:1px solid #004a8a; text-align:center; font-weight:600; white-space:nowrap;">#</th>
        <th style="padding:10px 12px; border:1px solid #004a8a; text-align:left; font-weight:600;">Part Number</th>
        <th style="padding:10px 12px; border:1px solid #004a8a; text-align:left; font-weight:600;">Description</th>
        <th style="padding:10px 12px; border:1px solid #004a8a; text-align:center; font-weight:600;">Qty</th>
        <th style="padding:10px 12px; border:1px solid #004a8a; text-align:center; font-weight:600;">UOM</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}
