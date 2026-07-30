import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/rfq/[id]/items — bulk update items
export async function PATCH(
  req: NextRequest,
  _ctx: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items } = await req.json();

  await Promise.all(
    items.map((item: any) =>
      prisma.rFQItem.update({
        where: { id: item.id },
        data: {
          rawPartNumber: item.rawPartNumber,
          rawDescription: item.rawDescription,
          standardPartNo: item.standardPartNo || null,
          qty: Number(item.qty),
        },
      })
    )
  );

  return NextResponse.json({ message: "Items updated." });
}
