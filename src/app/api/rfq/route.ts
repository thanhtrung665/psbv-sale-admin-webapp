import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // Build where clause: only filter by status if status is a valid non-empty value
  // Accepts: "INQUIRY_RECEIVED", "RFO_PENDING_ADMIN", etc.
  // Rejects: "", "ALL", "Tất cả", null, undefined
  const VALID_STATUSES = [
    "INQUIRY_RECEIVED",
    "RFO_PENDING_ADMIN",
    "RFO_SENT_TO_SUPPLIER",
    "SUPPLIER_QUOTED",
    "CBU_PENDING_ADMIN",
    "QUOTATION_DRAFTED",
    "QUOTED_TO_CLIENT",
  ];

  const shouldFilter = status && VALID_STATUSES.includes(status);

  try {
    const rfqs = await prisma.rFQ.findMany({
      where: shouldFilter ? { status: status as any } : undefined,
      include: { client: { select: { name: true, companyName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(rfqs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
