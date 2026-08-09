import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQuotationPdf } from "@/lib/pdf-renderer";
import fs from "fs";
import path from "path";

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
    });
    
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Check if a document already exists for this RFQ (optional caching)
    // If we want it to regenerate every time they load the page to capture latest CBU changes, we just generate it.
    
    const pdfBuffer = await generateQuotationPdf(rfqId);

    // Save PDF to local public/uploads for preview/download
    const fileName = `Quotation_${rfq.rfqCode}_${Date.now()}.pdf`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);
    const fileUrl = `/uploads/${fileName}`;

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
