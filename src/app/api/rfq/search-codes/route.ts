import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    const rfqs = await prisma.rFQ.findMany({
      where: {
        rfqCode: {
          contains: query,
          mode: "insensitive",
        },
        status: {
          in: ["INQUIRY_RECEIVED", "RFO_PENDING_ADMIN", "RFO_SENT_TO_SUPPLIER"],
        },
      },
      select: {
        id: true,
        rfqCode: true,
        client: {
          select: {
            name: true,
            companyName: true,
          },
        },
      },
      take: 10,
    });

    const formattedRfqs = rfqs.map((rfq) => ({
      id: rfq.id,
      rfqCode: rfq.rfqCode,
      clientName: rfq.client?.name || "",
      companyName: rfq.client?.companyName || "",
    }));

    return NextResponse.json(formattedRfqs);
  } catch (error: any) {
    console.error("[search-codes]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi máy chủ" },
      { status: 500 }
    );
  }
}
