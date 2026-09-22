import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderStatusSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  // Only filter by status if it's a valid, non-empty value.
  // Accepts: "INQUIRY_RECEIVED", "RFO_PENDING_ADMIN", etc. Rejects: "", "ALL", "Tất cả", null, undefined.
  const statusCheck = orderStatusSchema.safeParse(searchParams.get("status"));

  try {
    const rfqs = await prisma.rFQ.findMany({
      where: statusCheck.success ? { status: statusCheck.data } : undefined,
      include: { client: { select: { name: true, companyName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(rfqs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
