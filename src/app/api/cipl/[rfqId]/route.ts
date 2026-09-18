import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { rfqId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rfqId } = params;

    const ciplRecord = await prisma.ciplRecord.findFirst({
      where: { rfqId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { lineNo: "asc" } },
      },
    });

    if (!ciplRecord) {
      return NextResponse.json(
        { success: false, error: "No CIPL record found for this RFQ." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: ciplRecord });
  } catch (error: any) {
    console.error("[CIPL GET ERROR]", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}