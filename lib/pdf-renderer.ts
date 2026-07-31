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

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(/ /g, '-');

  // Calculate totals
  let tableRows = "";
  let totalWeight = 0;
  const totalUsd = rfq.totalRevenueUsd || 0;

  rfq.items.forEach((item) => {
    const unitPrice = item.qty > 0 && item.ddpPriceUsd ? item.ddpPriceUsd / item.qty : 0;
    const amount = item.ddpPriceUsd || 0;
    
    tableRows += `
      <tr>
        <td style="text-align: center; color: #c00000; font-weight: bold;">${item.lineNo}</td>
        <td style="text-align: center;">${item.standardPartNo || item.rawPartNumber}</td>
        <td style="text-align: center;">${item.supplier || "Keystone/USA"}</td>
        <td>${item.rawDescription}</td>
        <td style="text-align: center;">1-2 days</td>
        <td style="text-align: center;">${item.qty}</td>
        <td style="text-align: center;">${item.uom || "Ea"}</td>
        <td style="text-align: right;">$ ${unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align: right;">$ ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
    totalWeight += (item.netWeightLbs || 0) * item.qty;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 10px;
          color: #000;
          margin: 0;
          padding: 0;
          background: #fff;
        }
        /* HEADER */
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        .header-left h1 {
          margin: 0;
          font-size: 18px;
          font-weight: bold;
        }
        .header-left p {
          margin: 2px 0 0 0;
          font-size: 9px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .quotation-title {
          font-size: 18px;
          font-weight: bold;
          margin: 0;
        }
        .logo-box {
          font-family: Arial, sans-serif;
          font-weight: bold;
          font-size: 24px;
          line-height: 1;
        }
        .logo-box .red-text {
          color: #e31837;
          font-size: 8px;
          display: block;
        }

        /* INFO BLOCKS */
        .info-container {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .info-left, .info-right {
          width: 48%;
        }
        table.info-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }
        table.info-table td {
          padding: 2px;
          vertical-align: top;
        }
        .label {
          font-weight: bold;
          width: 70px;
        }
        .highlight {
          background-color: #ffff00;
        }

        /* ITEMS TABLE */
        table.items-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #000;
          margin-bottom: 10px;
        }
        table.items-table th, table.items-table td {
          border: 1px solid #000;
          padding: 5px;
          font-size: 10px;
        }
        table.items-table th {
          font-weight: bold;
          text-align: center;
        }
        .total-row td {
          font-weight: bold;
          border-top: 2px solid #000;
        }
        
        .total-weight {
          text-align: left;
          font-style: italic;
          padding-top: 2px;
        }

        /* FOOTER */
        .footer-container {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 9px;
          line-height: 1.3;
        }
        .footer-left {
          width: 40%;
        }
        .footer-right {
          width: 60%;
        }
        .ul-none {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .footer-label {
          text-decoration: underline;
          font-weight: bold;
          margin-bottom: 2px;
        }
      </style>
    </head>
    <body>

      <div class="header-container">
        <div class="header-left">
          <h1>PRESSURE SYSTEM BUILDERS VIETNAM CO., LTD</h1>
          <p>16 Yen The Str, Tan Son Hoa Ward, Ho Chi Minh City&nbsp;&nbsp;&nbsp;Tel: +84 2835472694&nbsp;&nbsp;&nbsp;Fax: +84 2835472641</p>
        </div>
        <div class="header-right">
          <div class="quotation-title">QUOTATION</div>
          <div class="logo-box">
            <span class="red-text">PRESSURE SYSTEM BUILDER:</span>
            PSBV<br>
            <span class="red-text" style="letter-spacing: 2px; text-align: justify; text-align-last: justify;">V I E T N A M</span>
          </div>
        </div>
      </div>

      <div class="info-container">
        <div class="info-left">
          <table class="info-table">
            <tr>
              <td class="label">Client:</td>
              <td><span class="highlight">${rfq.client.companyName}</span></td>
            </tr>
            <tr>
              <td class="label">Address:</td>
              <td>${rfq.client.address || ""}</td>
            </tr>
            <tr>
              <td class="label">Tel:</td>
              <td><span class="highlight">${rfq.client.phone || ""}</span></td>
            </tr>
            <tr>
              <td class="label">Attn:</td>
              <td>
                <span class="highlight" style="display:inline-block; width:100px;">${rfq.client.name}</span>
                <span style="color:#0070c0;">Email: </span><span class="highlight">${rfq.client.email}</span>
              </td>
            </tr>
            <tr>
              <td class="label">CINQ Ref:</td>
              <td><span class="highlight">Enquiry: BAKER SPD LIST</span></td>
            </tr>
          </table>
        </div>
        <div class="info-right">
          <table class="info-table" style="margin-left:auto; width: 80%;">
            <tr>
              <td class="label">Email:</td>
              <td style="color:#0070c0;">drilling@psbvn.com</td>
            </tr>
            <tr>
              <td class="label">Quote No.</td>
              <td><span class="highlight">${rfq.rfqCode}</span></td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td>${today}</td>
            </tr>
            <tr>
              <td class="label">Job File:</td>
              <td>${rfq.rfqCode}</td>
            </tr>
            <tr>
              <td class="label">Sales Director</td>
              <td>Vo Huu Trong</td>
            </tr>
            <tr>
              <td class="label">Sales PIC</td>
              <td>Vu Trong Hung</td>
            </tr>
          </table>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 5%">Item</th>
            <th style="width: 15%">Part No.</th>
            <th style="width: 15%">Brand/ Origin</th>
            <th style="width: 25%">Description</th>
            <th style="width: 10%">Leadtime</th>
            <th style="width: 6%">Quantity</th>
            <th style="width: 6%">UOM</th>
            <th style="width: 9%">Unit Price</th>
            <th style="width: 9%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td colspan="6" class="total-weight">
              <span style="text-decoration:underline; font-weight:bold;">Total Weight:</span> ${totalWeight.toFixed(2)} LBS
            </td>
          </tr>
          <tr class="total-row">
            <td colspan="7" style="border-right: none; text-align: right;">
              TOTAL FCA Lousiana, USA Incoterms 2020 (USD)
            </td>
            <td style="text-align: center; border-left: none;">$</td>
            <td style="text-align: right; border-left: none;">
              ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="footer-container">
        <div class="footer-left">
          <div class="footer-label">Please place order to:</div>
          <ul class="ul-none">
            <li>Pressure System Builders Vietnam Co., Ltd</li>
            <li>16 Yen The Street, Tan Son Hoa Ward</li>
            <li>Ho Chi Minh City, Vietnam.</li>
            <li>Tel: (+84) 2835472694</li>
            <li>Attn: Mr. Vo Huu Trong</li>
            <li>Email: salesdir@psbvn.com</li>
          </ul>
        </div>
        <div class="footer-right">
          <div class="footer-label">Term of Sales:</div>
          <table style="width:100%; font-size:9px;">
            <tr>
              <td style="width: 80px; vertical-align: top;">Prices are in:</td>
              <td>USD and net of any applicable taxes & levies at destination<br>
                  Invoice should be paid in full, and not subject to any withholding taxes or fees</td>
            </tr>
            <tr>
              <td style="vertical-align: top;">Lead time:</td>
              <td><strong>As per item production lead-time plus transit time subject to<br>
                  the time of PO placement and mode of transportation</strong></td>
            </tr>
            <tr>
              <td style="vertical-align: top;">Document:</td>
              <td>Declaration of Compliance/Certificate of Orgin issued by MNF (Copy)</td>
            </tr>
            <tr>
              <td style="vertical-align: top;"><span style="background-color:#ffc000;">Delivery Terms:</span></td>
              <td><span style="background-color:#ffc000;">FCA Houston, USA Incoterms 2020</span></td>
            </tr>
            <tr>
              <td style="vertical-align: top;">Payment Terms:</td>
              <td>TT% 100 Payment with order</td>
            </tr>
            <tr>
              <td style="vertical-align: top;">Quote Validity:</td>
              <td>30 days from quote date</td>
            </tr>
            <tr>
              <td style="vertical-align: top;">Minimum order value:</td>
              <td>Orders less than 500 USD is subject to a surcharge of 50 USD small ordering costs<br>
                  Price quote based on order in full quantity of item quoted</td>
            </tr>
          </table>
        </div>
      </div>

    </body>
    </html>
  `;

  // Provide sufficient margins and remove background if not needed
  const options = { 
    format: "A4", 
    printBackground: true, 
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" } 
  };
  const file = { content: htmlContent };

  const pdfBuffer = await pdf.generatePdf(file, options);
  return pdfBuffer;
}
