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

  // Format Items
  let totalWeight = 0;
  const totalUsd = rfq.totalRevenueUsd || 0;
  const items = rfq.items.map((item) => {
    const unitPrice = item.qty > 0 && item.ddpPriceUsd ? item.ddpPriceUsd / item.qty : 0;
    const amount = item.ddpPriceUsd || 0;
    totalWeight += (item.netWeightLbs || 0) * item.qty;

    return {
      part_no: item.standardPartNo || item.rawPartNumber,
      brand_origin: item.supplier || "Keystone/USA",
      description: item.rawDescription,
      leadtime: "1-2 days",
      quantity: item.qty.toString(),
      uom: item.uom || "Ea",
      unit_price: unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  });

  const payloadData = {
    client_name: rfq.client.companyName,
    client_address: rfq.client.address || "",
    client_tel: rfq.client.phone || "",
    client_attn: rfq.client.name,
    client_email: rfq.client.email,
    cinq_ref: "Enquiry: BAKER SPD LIST",
    quote_no: rfq.rfqCode,
    quote_date: today,
    job_file: rfq.rfqCode,
    sales_director: "Vo Huu Trong",
    sales_pic: "Vu Trong Hung",
    currency: "$",
    currency_code: "USD",
    min_rows: 8,
    items,
    total_weight: `${totalWeight.toFixed(2)} LBS`,
    total_label: "FCA Lousiana, USA Incoterms 2020",
    total_amount: totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    term_document: "Declaration of Compliance/Certificate of Orgin issued by MNF (Copy)",
    delivery_terms: "FCA Houston, USA Incoterms 2020",
    payment_terms: "TT% 100 Payment with order",
    quote_validity: "30 days from quote date",
    min_order_note: "Orders less than 500 USD is subject to a surcharge of 50 USD small ordering costs",
    price_basis_note: "Price quote based on order in full quantity of item quoted"
  };

  const apiKey = process.env.APITEMPLATE_API_KEY;
  const templateId = process.env.APITEMPLATE_QUOTATION_TEMPLATE_ID;

  if (!apiKey || !templateId) {
    throw new Error("Missing APITEMPLATE_API_KEY or APITEMPLATE_QUOTATION_TEMPLATE_ID in environment variables");
  }

  // Generate PDF via APITemplate.io
  const response = await fetch("https://api.apitemplate.io/v1/create", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: templateId,
      export_type: "json",
      output_file: `Quotation_${rfq.rfqCode}.pdf`,
      is_base64: 0,
      data: payloadData,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("APITemplate error:", errorText);
    throw new Error(`Failed to generate PDF from APITemplate: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.status !== "success" || !result.download_url) {
    throw new Error("Invalid response from APITemplate: " + JSON.stringify(result));
  }

  // Fetch the actual PDF file from download_url
  const pdfResponse = await fetch(result.download_url);
  if (!pdfResponse.ok) {
    throw new Error("Failed to download generated PDF from APITemplate");
  }

  const arrayBuffer = await pdfResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
