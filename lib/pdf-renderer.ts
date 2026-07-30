import pdf from "html-pdf-node";
import { prisma } from "./prisma";

export async function generateQuotationPdf(rfqId: string): Promise<Buffer> {
  const rfq = await prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: {
      client: true,
      items: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!rfq) throw new Error("RFQ not found");

  let supplierLogo = "";
  if (rfq.supplierName) {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { equals: rfq.supplierName, mode: "insensitive" } },
          { companyName: { equals: rfq.supplierName, mode: "insensitive" } },
        ],
      },
    });
    if (supplier && supplier.logoUrl) {
      supplierLogo = supplier.logoUrl;
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // generate HTML table rows
  let tableRows = "";
  let totalWeight = 0;

  rfq.items.forEach((item) => {
    tableRows += `
      <tr>
        <td style="text-align: center;">${item.lineNo}</td>
        <td style="text-align: center;">${item.qty}</td>
        <td>${item.standardPartNo || item.rawPartNumber}</td>
        <td>${item.rawDescription}</td>
        <td style="text-align: center;">${item.netWeightLbs || "-"}</td>
        <td style="text-align: right;">$${
          item.ddpPriceUsd ? (item.ddpPriceUsd / item.qty).toFixed(2) : "0.00"
        }</td>
        <td style="text-align: right;">$${(item.ddpPriceUsd || 0).toFixed(2)}</td>
      </tr>
    `;
    totalWeight += (item.netWeightLbs || 0) * item.qty;
  });

  const totalUsd = rfq.totalRevenueUsd || 0;
  const totalVnd = rfq.totalRevenueVnd || 0n;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; color: #333; margin: 0; padding: 40px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
        .logo-box { width: 120px; height: 50px; background: #1e3a8a; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; border-radius: 4px; letter-spacing: 2px; }
        .company-info { text-align: right; }
        .company-info h2 { margin: 0 0 5px 0; color: #1e3a8a; font-size: 18px; }
        .title { font-size: 24px; font-weight: bold; color: #1e3a8a; margin-bottom: 20px; letter-spacing: 1px; }
        
        .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .info-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; width: 45%; }
        .info-box h3 { margin-top: 0; margin-bottom: 10px; color: #4b5563; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
        .info-row { display: flex; margin-bottom: 5px; font-size: 11px; }
        .info-label { width: 90px; font-weight: bold; color: #6b7280; }
        
        table { border-collapse: collapse; margin-bottom: 30px; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; }
        th { background-color: #f3f4f6; color: #4b5563; font-weight: bold; text-align: left; }
        td { color: #1f2937; }
        
        .totals { display: flex; justify-content: flex-end; }
        .totals-table { width: 320px; }
        .totals-table th, .totals-table td { border: none; padding: 6px 8px; }
        .totals-table th { text-align: right; color: #6b7280; font-weight: normal; }
        .totals-table td { text-align: right; font-weight: bold; font-size: 13px; }
        .grand-total { font-size: 16px !important; color: #1e3a8a; border-top: 2px solid #1e3a8a !important; padding-top: 10px !important; }
        
        .terms { margin-top: 40px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        .terms h4 { margin: 0 0 10px 0; color: #4b5563; font-size: 12px; }
        .terms ol { padding-left: 15px; margin: 0; }
        .terms li { margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo-box">PSBV</div>
        </div>
        <div class="company-info">
          <h2>PSBV Trading & Service Co., Ltd.</h2>
          <p style="margin:0; font-size:11px; color:#6b7280;">123 Business Avenue, HCMC, Vietnam<br>Email: sales@psbv.com | Phone: +84 123 456 789</p>
        </div>
      </div>

      <div class="title">QUOTATION</div>

      <div class="info-grid">
        <div class="info-box">
          <h3>Customer Information</h3>
          <div class="info-row"><div class="info-label">Company:</div><div>${rfq.client.companyName}</div></div>
          <div class="info-row"><div class="info-label">Contact:</div><div>${rfq.client.name}</div></div>
          <div class="info-row"><div class="info-label">Email:</div><div>${rfq.client.email}</div></div>
        </div>
        <div class="info-box">
          <h3>Quote Details</h3>
          <div class="info-row"><div class="info-label">Quote No:</div><div>${rfq.rfqCode}</div></div>
          <div class="info-row"><div class="info-label">Date:</div><div>${today}</div></div>
          <div class="info-row"><div class="info-label">Valid For:</div><div>30 Days</div></div>
        </div>
      </div>

      ${supplierLogo ? `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <h3 style="margin: 0; color: #4b5563; font-size: 12px; text-transform: uppercase;">Product Specifications</h3>
        <img src="${supplierLogo}" alt="${rfq.supplierName}" style="max-height: 30px; object-fit: contain;"/>
      </div>
      ` : ''}
      <table>
        <thead>
          <tr>
            <th style="width: 5%; text-align:center;">#</th>
            <th style="width: 8%; text-align:center;">Qty</th>
            <th style="width: 22%">Part Number</th>
            <th style="width: 30%">Description</th>
            <th style="width: 10%; text-align:center;">Lbs</th>
            <th style="width: 12.5%; text-align:right;">Unit Price</th>
            <th style="width: 12.5%; text-align:right;">Total (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="totals">
        <table class="totals-table">
          <tr>
            <th>Total Weight:</th>
            <td>${totalWeight.toFixed(2)} lbs</td>
          </tr>
          <tr>
            <th>Subtotal (USD):</th>
            <td>$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <th class="grand-total">GRAND TOTAL (VND):</th>
            <td class="grand-total">${Number(totalVnd).toLocaleString("vi-VN")} ₫</td>
          </tr>
        </table>
      </div>

      <div class="terms">
        <h4>TERMS & CONDITIONS</h4>
        <ol>
          <li><strong>Delivery Term:</strong> DDP (Delivered Duty Paid) to customer's site.</li>
          <li><strong>Payment Term:</strong> 100% advance or as agreed upon in official contract.</li>
          <li><strong>Lead Time:</strong> Subject to final confirmation by the manufacturer at the time of order placement.</li>
          <li><strong>Validity:</strong> This quotation is valid for 30 days from the date of issue.</li>
        </ol>
      </div>
    </body>
    </html>
  `;

  const options = { format: "A4", printBackground: true, margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" } };
  const file = { content: htmlContent };

  const pdfBuffer = await pdf.generatePdf(file, options);
  return pdfBuffer;
}
