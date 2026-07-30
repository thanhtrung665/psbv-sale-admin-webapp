import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = [
  "INQUIRY_RECEIVED",
  "RFO_PENDING_ADMIN",
  "RFO_SENT_TO_SUPPLIER",
  "SUPPLIER_QUOTED",
  "CBU_PENDING_ADMIN",
  "QUOTATION_DRAFTED",
  "QUOTED_TO_CLIENT",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const data: any = { status };
  if (status === "RFO_SENT_TO_SUPPLIER") {
    data.approvedById = (session.user as any).id;
  }

  const rfq = await prisma.rFQ.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(rfq);
}
