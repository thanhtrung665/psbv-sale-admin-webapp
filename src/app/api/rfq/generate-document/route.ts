import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_DOC_TYPES = [
  "QUOTATION_CLIENT_PDF",
  "MVPO_SUPPLIER_PDF",
  "COMMERCIAL_INVOICE_PDF",
  "CERTIFICATE_COC_COO_PDF",
] as const;

type DocType = (typeof VALID_DOC_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rfqCode, docType } = body as { rfqCode: string; docType: DocType };

    if (!rfqCode || !rfqCode.trim()) {
      return NextResponse.json(
        { success: false, message: "Thiếu mã đơn hàng (rfqCode)." },
        { status: 400 }
      );
    }

    if (!VALID_DOC_TYPES.includes(docType as DocType)) {
      return NextResponse.json(
        { success: false, message: `Loại tài liệu không hợp lệ: ${docType}` },
        { status: 400 }
      );
    }

    const rfq = await prisma.rFQ.findUnique({
      where: { rfqCode: rfqCode.trim() },
      include: {
        client: true,
        items: { orderBy: { lineNo: "asc" } },
      },
    });

    if (!rfq) {
      return NextResponse.json(
        { success: false, message: `Không tìm thấy đơn hàng với mã: ${rfqCode}` },
        { status: 404 }
      );
    }

    const totalAmount = (rfq.items || []).reduce((sum, item) => sum + (Number(item.ddpPriceUsd || 0) * Number(item.qty || 0)), 0);
    const totalWeight = (rfq.items || []).reduce((sum, item) => sum + (Number(item.netWeightLbs || 0)), 0);

    const payload = {
      client_name: rfq?.client?.companyName || rfq?.client?.name || "",
      client_address: rfq?.client?.address || "",
      client_tel: rfq?.client?.phone || "",
      client_attn: rfq?.client?.name || "",
      client_email: rfq?.client?.email || "",
      cinq_ref: rfq?.opportunityName ? `Enquiry: ${rfq.opportunityName}` : "",
      quote_no: rfq?.rfqCode || "",
      quote_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'),
      job_file: rfq?.rfqCode || "",
      sales_director: "Vo Huu Trong",
      sales_pic: "Vu Trong Hung",
      currency: "$",
      currency_code: "USD",
      min_rows: 8,
      items: (rfq.items || []).map((item: any) => ({
        part_no: item?.standardPartNo || item?.rawPartNumber || "",
        brand_origin: rfq?.supplierName ? `${rfq.supplierName}/USA` : item?.supplier || "USA",
        description: item?.rawDescription || item?.description || "",
        leadtime: "1-2 days",
        quantity: String(item?.qty || 0),
        uom: item?.uom || "Ea",
        unit_price: Number(item.ddpPriceUsd ? (item.ddpPriceUsd / item.qty) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        amount: Number(item.ddpPriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      })),
      total_weight: `${totalWeight.toLocaleString('en-US', { minimumFractionDigits: 2 })} LBS`,
      total_label: `${rfq?.incoTerm || 'FCA'} USA Incoterms 2020`,
      total_amount: totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      term_document: "Declaration of Compliance/Certificate of Origin issued by MNF (Copy)",
      delivery_terms: `${rfq?.incoTerm || 'FCA'} Houston, USA Incoterms 2020`,
      payment_terms: rfq?.paymentTerm || "TT 100% Payment with order",
      quote_validity: "30 days from quote date",
      min_order_note: "Orders less than 500 USD is subject to a surcharge of 50 USD small ordering costs",
      price_basis_note: "Price quote based on order in full quantity of item quoted"
    };

    const rawApiKey = process.env.APITEMPLATE_API_KEY || "";
    const rawTemplateId = process.env.APITEMPLATE_QUOTATION_TEMPLATE_ID || "";
    
    const apiKey = rawApiKey.replace(/['"]/g, '').trim();
    const templateId = rawTemplateId.replace(/['"]/g, '').trim();

    if (!apiKey || apiKey === "undefined" || !templateId) {
      return NextResponse.json({ 
        success: false, 
        message: `[VERCEL ENV ERROR] Không tìm thấy API Key hoặc Template ID. Giá trị hiện tại: API_KEY=${apiKey}` 
      }, { status: 500 });
    }

    const apitemplateRes = await fetch(`https://rest.apitemplate.io/v2/create-pdf?template_id=${templateId}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    if (!apitemplateRes.ok) {
      const errorText = await apitemplateRes.text();
      console.error("APITemplate error:", errorText);
      throw new Error(`APITemplate trả về lỗi: ${apitemplateRes.status}`);
    }

    const apitemplateResult = await apitemplateRes.json();
    if (apitemplateResult.status !== "success" || !apitemplateResult.download_url) {
      throw new Error("Lỗi phản hồi từ APITemplate: " + JSON.stringify(apitemplateResult));
    }

    const pdfResponse = await fetch(apitemplateResult.download_url);
    if (!pdfResponse.ok) {
      throw new Error("Không thể tải file PDF từ APITemplate");
    }
    const arrayBuffer = await pdfResponse.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    let fileTypeSuffix = "Quotation";
    if (docType === "MVPO_SUPPLIER_PDF") fileTypeSuffix = "MVPO";
    if (docType === "COMMERCIAL_INVOICE_PDF") fileTypeSuffix = "CommercialInvoice";
    if (docType === "CERTIFICATE_COC_COO_PDF") fileTypeSuffix = "COC_COO";

    const fileName = `${rfqCode}_${fileTypeSuffix}_${Date.now()}.pdf`;

    let fileUrl: string;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(`rfq/${rfqCode}/${fileName}`, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(`rfq/${rfqCode}/${fileName}`);

      fileUrl = urlData.publicUrl;
    } catch (uploadErr: any) {
      console.error("[generate-document] Upload error:", uploadErr);
      const base64 = pdfBuffer.toString("base64");
      fileUrl = `data:application/pdf;base64,${base64}`;
    }

    await prisma.document.create({
      data: {
        rfqId: rfq.id,
        type: docType,
        fileUrl,
      },
    });

    return NextResponse.json({
      success: true,
      url: fileUrl,
      fileName,
      rfqCode,
      docType,
    });
  } catch (error: any) {
    console.error("[generate-document]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Lỗi máy chủ khi tạo file." },
      { status: 500 }
    );
  }
}
