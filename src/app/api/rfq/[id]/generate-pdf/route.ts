import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rfqId = params.id;

    // Check if the RFQ exists
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: {
        client: true,
        items: { orderBy: { lineNo: "asc" } },
      },
    });
    
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    const apiKey = process.env.APITEMPLATE_API_KEY;
    const templateId = process.env.APITEMPLATE_QUOTATION_TEMPLATE_ID;

    if (!apiKey || !templateId) {
      throw new Error("Thiếu APITEMPLATE_API_KEY hoặc APITEMPLATE_QUOTATION_TEMPLATE_ID trong .env");
    }

    const apitemplateRes = await fetch("https://api.apitemplate.io/v1/create", {
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
        data: payload,
      }),
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
    
    const fileName = `Quotation_${rfq.rfqCode}_${Date.now()}.pdf`;

    let fileUrl: string;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(`rfq/${rfq.rfqCode}/${fileName}`, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(`rfq/${rfq.rfqCode}/${fileName}`);

      fileUrl = urlData.publicUrl;
    } catch (uploadErr: any) {
      console.error("[generate-pdf] Upload error:", uploadErr);
      const base64 = pdfBuffer.toString("base64");
      fileUrl = `data:application/pdf;base64,${base64}`;
    }

    // Save to DB Document table
    const document = await prisma.document.create({
      data: {
        rfqId,
        type: "MVPO_QUOTATION_PDF",
        fileUrl,
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl,
      documentId: document.id
    });

  } catch (err: any) {
    console.error("[generate-pdf]", err);
    return NextResponse.json({ error: err.message || "Có lỗi xảy ra" }, { status: 500 });
  }
}
