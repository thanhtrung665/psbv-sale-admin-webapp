import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rfq = await prisma.rFQ.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      items: { orderBy: { lineNo: "asc" } },
      documents: true,
    },
  });

  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let supplierLogo = null;
  if (rfq.supplierName) {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { equals: rfq.supplierName, mode: "insensitive" } },
          { companyName: { equals: rfq.supplierName, mode: "insensitive" } },
        ],
      },
    });
    if (supplier) supplierLogo = supplier.logoUrl;
  }

  return NextResponse.json({ ...rfq, supplierLogo });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.rFQ.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
