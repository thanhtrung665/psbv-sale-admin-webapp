import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderStatusSchema } from "@/lib/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json();
  if (!orderStatusSchema.safeParse(status).success) {
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
