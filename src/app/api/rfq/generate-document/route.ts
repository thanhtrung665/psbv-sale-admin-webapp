import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQuotationPdf } from "@/lib/pdf-renderer";

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

    // Validate inputs
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

    // Look up RFQ
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

    let pdfBuffer: Buffer;
    let fileTypeSuffix: string;

    // Route to appropriate generator based on docType
    // Currently only QUOTATION_CLIENT_PDF has a full renderer.
    // Others will use the same template until separate renderers are built.
    switch (docType) {
      case "QUOTATION_CLIENT_PDF":
        pdfBuffer = await generateQuotationPdf(rfq.id);
        fileTypeSuffix = "Quotation";
        break;
      case "MVPO_SUPPLIER_PDF":
        // TODO: Add dedicated MVPO renderer
        pdfBuffer = await generateQuotationPdf(rfq.id);
        fileTypeSuffix = "MVPO";
        break;
      case "COMMERCIAL_INVOICE_PDF":
        // TODO: Add dedicated Commercial Invoice renderer
        pdfBuffer = await generateQuotationPdf(rfq.id);
        fileTypeSuffix = "CommercialInvoice";
        break;
      case "CERTIFICATE_COC_COO_PDF":
        // TODO: Add dedicated COC/COO renderer
        pdfBuffer = await generateQuotationPdf(rfq.id);
        fileTypeSuffix = "COC_COO";
        break;
      default:
        return NextResponse.json(
          { success: false, message: "Loại tài liệu không được hỗ trợ." },
          { status: 400 }
        );
    }

    const fileName = `${rfqCode}_${fileTypeSuffix}_${Date.now()}.pdf`;

    // Upload to Supabase Storage
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
      // Fallback: return as base64 data URL
      const base64 = pdfBuffer.toString("base64");
      fileUrl = `data:application/pdf;base64,${base64}`;
    }

    // Save Document record to DB
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
